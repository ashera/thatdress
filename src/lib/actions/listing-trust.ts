"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { isTrustStatus } from "@/lib/listing-trust";

const REASON_MAX = 500;

/**
 * Admin-only: set a listing's trust_status to 'flagged' (suspect /
 * under review) or back to 'self-declared' (false alarm). Used from
 * the listing detail page and the /admin/listings/flagged queue.
 *
 * 'verified' is also accepted so admins can manually elevate a listing
 * that doesn't meet the auto-elevation criteria but is genuinely
 * trustworthy. 'authenticated' will be set by the future third-party
 * partnership integration, not here.
 *
 * For the 'flagged' transition we require a non-empty `reason` field
 * and write a row to listing_flags so we have an audit trail (who
 * flagged it, when, why). For the 'self-declared' restore transition
 * we mark all currently-open flags on the listing as resolved.
 */
export async function setListingTrustStatus(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) redirect("/admin/listings/flagged");

  const status = String(formData.get("status") ?? "");
  if (!isTrustStatus(status)) redirect("/admin/listings/flagged");
  if (status === "authenticated") {
    redirect(`/listings/${listingId}?error=authenticated-not-supported`);
  }

  const next = String(formData.get("next") ?? "");

  if (status === "flagged") {
    const reason = String(formData.get("reason") ?? "")
      .trim()
      .slice(0, REASON_MAX);
    if (!reason) {
      redirect(`/listings/${listingId}?error=flag-reason-required`);
    }
    await query(
      `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
      [status, listingId],
    );
    await query(
      `INSERT INTO listing_flags (listing_id, flagged_by_user_id, reason)
         VALUES ($1::bigint, $2::bigint, $3)`,
      [listingId, admin.id, reason],
    );
  } else {
    await query(
      `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
      [status, listingId],
    );
    if (status === "self-declared") {
      const note = String(formData.get("resolveNote") ?? "")
        .trim()
        .slice(0, REASON_MAX);
      await query(
        `UPDATE listing_flags
            SET resolved_at = NOW(),
                resolved_by_user_id = $1::bigint,
                resolution_note = $2
          WHERE listing_id = $3::bigint
            AND resolved_at IS NULL`,
        [admin.id, note || null, listingId],
      );
    }
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
  revalidatePath("/admin/listings/flagged");

  if (next === "queue") redirect("/admin/listings/flagged?saved=1");
  redirect(`/listings/${listingId}`);
}

/**
 * Buyer-side report. Any signed-in user who isn't the listing's
 * seller can submit a reason; the row goes into listing_flags
 * (audit trail) but does NOT change trust_status — admins triage
 * buyer reports from /admin/listings/flagged and decide whether
 * to elevate to flagged or dismiss. Stops a single buyer from
 * piling on with multiple open reports against the same listing.
 */
export async function submitBuyerListingFlag(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) redirect("/listings");

  // Block flagging your own listing.
  const owner = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings
      WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const sellerId = owner.rows[0]?.seller_id;
  if (!sellerId) redirect("/listings");
  if (sellerId === user.id) {
    redirect(`/listings/${listingId}?reported=own`);
  }

  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, REASON_MAX);
  if (!reason) {
    redirect(`/listings/${listingId}?reported=missing-reason`);
  }

  // Idempotency: don't let one buyer pile up multiple open reports
  // on the same listing. The earlier one stays in the queue until
  // an admin resolves it.
  const dupe = await query<{ id: string }>(
    `SELECT id::text FROM listing_flags
      WHERE listing_id = $1::bigint
        AND flagged_by_user_id = $2::bigint
        AND resolved_at IS NULL
      LIMIT 1`,
    [listingId, user.id],
  );
  if (dupe.rows[0]) {
    redirect(`/listings/${listingId}?reported=duplicate`);
  }

  await query(
    `INSERT INTO listing_flags (listing_id, flagged_by_user_id, reason)
       VALUES ($1::bigint, $2::bigint, $3)`,
    [listingId, user.id, reason],
  );

  revalidatePath("/admin/listings/flagged");
  redirect(`/listings/${listingId}?reported=1`);
}

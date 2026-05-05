"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isTrustStatus } from "@/lib/listing-trust";

/**
 * Admin-only: set a listing's trust_status to 'flagged' (suspect /
 * under review) or back to 'self-declared' (false alarm). Used from
 * the listing detail page and the /admin/listings/flagged queue.
 *
 * 'verified' is also accepted so admins can manually elevate a listing
 * that doesn't meet the auto-elevation criteria but is genuinely
 * trustworthy. 'authenticated' will be set by the future third-party
 * partnership integration, not here.
 */
export async function setListingTrustStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) redirect("/admin/listings/flagged");

  const status = String(formData.get("status") ?? "");
  if (!isTrustStatus(status)) redirect("/admin/listings/flagged");
  if (status === "authenticated") {
    redirect(`/listings/${listingId}?error=authenticated-not-supported`);
  }

  await query(
    `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
    [status, listingId],
  );

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
  revalidatePath("/admin/listings/flagged");

  const next = String(formData.get("next") ?? "");
  if (next === "queue") redirect("/admin/listings/flagged?saved=1");
  redirect(`/listings/${listingId}`);
}

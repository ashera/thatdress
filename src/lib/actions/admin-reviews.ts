"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const PAGE = "/admin/reviews";

/**
 * Toggle a review's admin-hidden state. Hidden reviews stay in the
 * table for audit but drop off the public seller profile (the
 * getSellerReviewSummary / listSellerReviews helpers both filter by
 * hidden_by_admin_at IS NULL). Pass mode='hide' to take it down,
 * 'unhide' to put it back.
 */
export async function setReviewHidden(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("reviewId") ?? "");
  if (!/^\d+$/.test(id)) redirect(PAGE);

  const mode = String(formData.get("mode") ?? "");
  const hidden = mode === "hide";
  await query(
    `UPDATE listing_reviews
        SET hidden_by_admin_at = $2
      WHERE id = $1::bigint`,
    [id, hidden ? new Date() : null],
  );

  // Bump the seller's profile cache so the average + list reflect
  // the change immediately on the next render.
  const r = await query<{ seller_id: string }>(
    `SELECT seller_id::text FROM listing_reviews WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  if (r.rows[0]) revalidatePath(`/sellers/${r.rows[0].seller_id}`);

  revalidatePath(PAGE);
  redirect(`${PAGE}?action=${hidden ? "hidden" : "unhidden"}`);
}

/** Clear the seller's flag without changing the review's visibility.
 *  Use this when the admin reviews a flag and decides the review is
 *  fair after all — the row drops off the 'flagged' filter but the
 *  rating still stands. */
export async function resolveReviewFlag(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("reviewId") ?? "");
  if (!/^\d+$/.test(id)) redirect(PAGE);

  await query(
    `UPDATE listing_reviews
        SET flagged_at = NULL,
            flag_reason = NULL
      WHERE id = $1::bigint`,
    [id],
  );

  revalidatePath(PAGE);
  redirect(`${PAGE}?action=flag-resolved`);
}

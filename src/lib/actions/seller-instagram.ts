"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";

/**
 * Seller-side version of logInstagramPost. The seller posts their
 * own listing to Instagram, pastes the resulting URL back, and we
 * record the social link in the same backlinks ledger admins use.
 *
 * Gated to the listing's seller (admins use the admin composer at
 * /admin/links/instagram). Same shape of insert as the admin
 * version — marketing surface is uniform regardless of who posted.
 */
export async function logSellerInstagramPost(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listing_id") ?? "").trim();
  const postUrl = String(formData.get("post_url") ?? "").trim();
  const caption = String(formData.get("caption") ?? "")
    .trim()
    .slice(0, 2200);

  if (!/^\d+$/.test(listingId)) {
    redirect("/listings/mine?promote=bad-listing");
  }

  // Verify the listing is theirs (admins use the admin composer for
  // listings they don't own).
  const r = await query<{ title: string; seller_id: string }>(
    `SELECT title, seller_id::text AS seller_id
       FROM listings
      WHERE id = $1::bigint
      LIMIT 1`,
    [listingId],
  );
  const listing = r.rows[0];
  if (!listing) {
    redirect("/listings/mine?promote=listing-not-found");
  }
  if (listing.seller_id !== user.id && !user.isAdmin) {
    redirect("/listings/mine?promote=not-yours");
  }

  if (!postUrl) {
    redirect(`/listings/${listingId}/promote?error=missing-url`);
  }
  let parsed: URL;
  try {
    parsed = new URL(postUrl);
  } catch {
    redirect(`/listings/${listingId}/promote?error=bad-url`);
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "instagram.com" && host !== "instagr.am") {
    redirect(`/listings/${listingId}/promote?error=not-instagram`);
  }

  const base = getShareBaseUrl();
  const targetUrl = `${base}/listings/${listingId}`;
  const sourceTitle = `Instagram post: ${listing.title}`;
  const noteIntro = user.isAdmin
    ? "Logged by admin via seller promote page."
    : "Logged by seller (self-promotion).";

  await query(
    `INSERT INTO backlinks (
       source_url, source_domain, source_title,
       target_url, anchor_text,
       status, link_type, source_kind,
       last_checked_at, notes, created_by_user_id
     ) VALUES (
       $1, 'instagram.com', $2,
       $3, $4,
       'alive', 'nofollow', 'social',
       NOW(), $5, $6::bigint
     )`,
    [
      postUrl,
      sourceTitle,
      targetUrl,
      listing.title,
      caption
        ? `${noteIntro}\n\nCaption excerpt: ${caption.slice(0, 500)}`
        : noteIntro,
      user.id,
    ],
  );

  revalidatePath(`/listings/${listingId}/promote`);
  revalidatePath("/admin/links");
  redirect(`/listings/${listingId}/promote?logged=1`);
}

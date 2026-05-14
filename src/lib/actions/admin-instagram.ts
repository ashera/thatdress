"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";

/**
 * After an admin manually posts a generated card to Instagram on
 * their phone, they paste the resulting post / reel URL back into
 * the composer and submit this action. We validate it's actually
 * an instagram.com URL and log it to the backlinks ledger so it
 * lands in the standard verification + reporting pipeline.
 *
 * Instagram applies rel='nofollow' to outbound URLs (and caption
 * URLs aren't even clickable), so the SEO win is referral traffic
 * from the bio link + hashtag-search discoverability rather than
 * PageRank — link_type stamped 'nofollow' accordingly.
 */
export async function logInstagramPost(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const listingId = String(formData.get("listing_id") ?? "").trim();
  const postUrl = String(formData.get("post_url") ?? "").trim();
  const caption = String(formData.get("caption") ?? "")
    .trim()
    .slice(0, 2200);

  if (!/^\d+$/.test(listingId)) {
    redirect("/admin/links/instagram?error=bad-listing");
  }
  if (!postUrl) {
    redirect(
      `/admin/links/instagram?listing_id=${listingId}&error=missing-url`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(postUrl);
  } catch {
    redirect(
      `/admin/links/instagram?listing_id=${listingId}&error=bad-url`,
    );
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "instagram.com" && host !== "instagr.am") {
    redirect(
      `/admin/links/instagram?listing_id=${listingId}&error=not-instagram`,
    );
  }

  // Verify the listing exists; we'll point the backlink at its
  // public URL (the post's caption pitch even if not clickable,
  // and what we'd want the verification job to re-fetch later).
  const r = await query<{ title: string }>(
    `SELECT title FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const listing = r.rows[0];
  if (!listing) {
    redirect("/admin/links/instagram?error=listing-not-found");
  }

  const base = getShareBaseUrl();
  const targetUrl = `${base}/listings/${listingId}`;
  const sourceTitle = `Instagram post: ${listing.title}`;

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
      caption ? `Caption excerpt: ${caption.slice(0, 500)}` : null,
      user.id,
    ],
  );

  revalidatePath("/admin/links");
  revalidatePath("/admin/links/instagram");
  redirect(
    `/admin/links/instagram?logged=1&listing_id=${listingId}`,
  );
}

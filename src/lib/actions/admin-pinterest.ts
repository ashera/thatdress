"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";
import { createPinterestPin } from "@/lib/pinterest";

const TITLE_MAX = 100;
const DESC_MAX = 500;

function clean(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

/**
 * Compose a pin for a frockd listing, fire it off to Pinterest v5,
 * then record the resulting pin URL in the backlinks ledger.
 *
 * Listing-based: admin picks an existing listing id from the form.
 * We fetch the title + primary image server-side so the image URL
 * is always our public CDN endpoint (Pinterest fetches it once,
 * stores its own copy). Title and description default from the
 * listing but the admin can override before submitting.
 *
 * Outcome lands in /admin/links/pinterest as a flash:
 *   ok:    Pin id + URL; backlinks row inserted.
 *   error: API status + Pinterest's error message verbatim.
 */
export async function createPinFromListing(
  formData: FormData,
): Promise<void> {
  const user = await requireAdmin();

  const listingId = clean(formData, "listing_id", 24);
  const boardId = clean(formData, "board_id", 64);
  const title = clean(formData, "title", TITLE_MAX);
  const description = clean(formData, "description", DESC_MAX);

  if (!/^\d+$/.test(listingId)) {
    redirect("/admin/links/pinterest?error=bad-listing");
  }
  if (!boardId) {
    redirect("/admin/links/pinterest?error=missing-board");
  }
  if (!title) {
    redirect("/admin/links/pinterest?error=missing-title");
  }

  // Pull the listing's primary image to use as the pin media.
  // Pinterest needs a publicly-reachable URL — our /api/listings/
  // {id}/images/{imageId} endpoint qualifies as long as the
  // listing is published.
  const r = await query<{
    title: string;
    is_draft: boolean;
    is_published: boolean;
    primary_image_id: string | null;
  }>(
    `SELECT l.title,
            l.is_draft,
            l.is_published,
            (
              SELECT li.id::text FROM listing_images li
                WHERE li.listing_id = l.id
                ORDER BY li.is_primary DESC, li.position, li.id
                LIMIT 1
            ) AS primary_image_id
       FROM listings l
      WHERE l.id = $1::bigint
      LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) {
    redirect("/admin/links/pinterest?error=listing-not-found");
  }
  if (row.is_draft || !row.is_published) {
    redirect("/admin/links/pinterest?error=listing-not-public");
  }
  if (!row.primary_image_id) {
    redirect("/admin/links/pinterest?error=no-image");
  }

  const base = getShareBaseUrl();
  const link = `${base}/listings/${listingId}`;
  const imageUrl = `${base}/api/listings/${listingId}/images/${row.primary_image_id}?w=1200`;

  const result = await createPinterestPin({
    boardId,
    link,
    imageUrl,
    title,
    description,
    altText: row.title,
  });

  if (!result.ok) {
    const encoded = encodeURIComponent(result.error);
    redirect(
      `/admin/links/pinterest?error=pin-failed&status=${result.status}&detail=${encoded}`,
    );
  }

  // Record the pin in the backlinks ledger so it shows up in the
  // standard verification + reporting pipeline. nofollow because
  // Pinterest applies rel='nofollow ugc' to outbound pin links.
  await query(
    `INSERT INTO backlinks (
       source_url, source_domain, source_title,
       target_url, anchor_text,
       status, link_type, source_kind,
       last_checked_at, notes, created_by_user_id
     ) VALUES (
       $1, 'pinterest.com', $2,
       $3, $4,
       'alive', 'nofollow', 'social',
       NOW(), $5, $6::bigint
     )`,
    [
      result.url,
      `Pin: ${title}`,
      link,
      title,
      `Auto-created from /admin/links/pinterest. Pin id ${result.id}.`,
      user.id,
    ],
  );

  revalidatePath("/admin/links");
  revalidatePath("/admin/links/pinterest");
  redirect(
    `/admin/links/pinterest?ok=1&pin_url=${encodeURIComponent(result.url)}`,
  );
}

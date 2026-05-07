import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { query } from "@/lib/db";

const HASH_SALT = process.env.VIEW_IP_SALT ?? "frockd-views";

async function clientIpHash(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const raw =
      fwd?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    if (!raw) return null;
    return createHash("sha256")
      .update(raw + HASH_SALT)
      .digest("hex")
      .slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Insert a view row for the listing. Skips when the viewer is the seller
 * (no point inflating own stats) or when the same viewer/IP has already
 * been recorded in the last hour (cheap dedup so a refresh doesn't count
 * twice). Failures are swallowed.
 */
export async function trackListingView(opts: {
  listingId: string;
  viewerId: string | null;
  sellerId: string | null;
}): Promise<void> {
  const { listingId, viewerId, sellerId } = opts;
  if (!/^\d+$/.test(listingId)) return;
  if (viewerId && sellerId && viewerId === sellerId) return;

  try {
    const ipHash = await clientIpHash();
    // Hourly dedup per (listing, viewer or ip).
    if (viewerId) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM listing_views
          WHERE listing_id = $1::bigint
            AND viewer_id = $2::bigint
            AND viewed_at > NOW() - INTERVAL '1 hour'
          LIMIT 1`,
        [listingId, viewerId],
      );
      if (existing.rows.length > 0) return;
    } else if (ipHash) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM listing_views
          WHERE listing_id = $1::bigint
            AND viewer_id IS NULL
            AND ip_hash = $2
            AND viewed_at > NOW() - INTERVAL '1 hour'
          LIMIT 1`,
        [listingId, ipHash],
      );
      if (existing.rows.length > 0) return;
    }

    await query(
      `INSERT INTO listing_views (listing_id, viewer_id, ip_hash)
       VALUES ($1::bigint, $2::bigint, $3)`,
      [listingId, viewerId, ipHash],
    );
  } catch {
    // ignore — tracking failures shouldn't break the page
  }
}

export type ListingStats = {
  total: number;
  last7: number;
  uniqueViewers: number;
};

export async function getListingStats(
  listingId: string,
): Promise<ListingStats> {
  if (!/^\d+$/.test(listingId)) {
    return { total: 0, last7: 0, uniqueViewers: 0 };
  }
  try {
    const r = await query<{
      total: string;
      last7: string;
      unique_viewers: string;
    }>(
      `SELECT COUNT(*)::text                                            AS total,
              COUNT(*) FILTER (WHERE viewed_at > NOW() - INTERVAL '7 days')::text AS last7,
              COUNT(DISTINCT COALESCE(viewer_id::text, ip_hash))::text  AS unique_viewers
         FROM listing_views
        WHERE listing_id = $1::bigint`,
      [listingId],
    );
    const row = r.rows[0];
    return {
      total: Number(row?.total ?? 0),
      last7: Number(row?.last7 ?? 0),
      uniqueViewers: Number(row?.unique_viewers ?? 0),
    };
  } catch {
    return { total: 0, last7: 0, uniqueViewers: 0 };
  }
}

export type SellerStats = {
  /** Live listings the seller has on the marketplace right now. */
  activeListings: number;
  /** Listings already marked sold. */
  soldListings: number;
  /** Total page-views across every listing the seller has ever had. */
  totalViews: number;
  /** Page-views in the last 7 days. */
  viewsLast7: number;
  /** Distinct viewers (signed-in user id, or hashed IP for guests). */
  uniqueViewers: number;
  /** Conversations buyers have started with the seller. */
  conversations: number;
  /** Open offers waiting on the seller. */
  openOffers: number;
  /** Top-performing live listing by 7-day views. */
  topListing: {
    id: string;
    title: string;
    views7: number;
    primary_image_id: string | null;
  } | null;
};

export async function getSellerStats(userId: string): Promise<SellerStats> {
  const empty: SellerStats = {
    activeListings: 0,
    soldListings: 0,
    totalViews: 0,
    viewsLast7: 0,
    uniqueViewers: 0,
    conversations: 0,
    openOffers: 0,
    topListing: null,
  };
  if (!/^\d+$/.test(userId)) return empty;

  try {
    // Single round-trip for the headline counters. listing_views joins
    // back to listings to filter by seller; subqueries on listings give
    // us the active/sold counts without a separate query.
    const head = await query<{
      active_listings: string;
      sold_listings: string;
      total_views: string;
      views_last7: string;
      unique_viewers: string;
      conversations: string;
      open_offers: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM listings
            WHERE seller_id = $1::bigint
              AND is_draft = FALSE
              AND is_published = TRUE
              AND sold_at IS NULL)                        AS active_listings,
        (SELECT COUNT(*)::text FROM listings
            WHERE seller_id = $1::bigint
              AND sold_at IS NOT NULL)                     AS sold_listings,
        (SELECT COUNT(*)::text FROM listing_views v
            JOIN listings l ON l.id = v.listing_id
            WHERE l.seller_id = $1::bigint)                AS total_views,
        (SELECT COUNT(*)::text FROM listing_views v
            JOIN listings l ON l.id = v.listing_id
            WHERE l.seller_id = $1::bigint
              AND v.viewed_at > NOW() - INTERVAL '7 days') AS views_last7,
        (SELECT COUNT(DISTINCT COALESCE(v.viewer_id::text, v.ip_hash))::text
            FROM listing_views v
            JOIN listings l ON l.id = v.listing_id
            WHERE l.seller_id = $1::bigint)                AS unique_viewers,
        (SELECT COUNT(*)::text FROM conversations c
            JOIN listings l ON l.id = c.listing_id
            WHERE l.seller_id = $1::bigint)                AS conversations,
        (SELECT COUNT(*)::text FROM offers o
            JOIN listings l ON l.id = o.listing_id
            WHERE l.seller_id = $1::bigint
              AND o.status = 'pending')                    AS open_offers`,
      [userId],
    );
    const row = head.rows[0];

    // Top live listing by 7-day views — only listings still on sale.
    const top = await query<{
      id: string;
      title: string;
      views7: string;
      primary_image_id: string | null;
    }>(
      `SELECT l.id::text,
              l.title,
              COUNT(v.id) FILTER (WHERE v.viewed_at > NOW() - INTERVAL '7 days')::text AS views7,
              (SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1) AS primary_image_id
         FROM listings l
         LEFT JOIN listing_views v ON v.listing_id = l.id
        WHERE l.seller_id = $1::bigint
          AND l.is_draft = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
        GROUP BY l.id, l.title
        ORDER BY views7 DESC, l.created_at DESC
        LIMIT 1`,
      [userId],
    );
    const t = top.rows[0];

    return {
      activeListings: Number(row?.active_listings ?? 0),
      soldListings: Number(row?.sold_listings ?? 0),
      totalViews: Number(row?.total_views ?? 0),
      viewsLast7: Number(row?.views_last7 ?? 0),
      uniqueViewers: Number(row?.unique_viewers ?? 0),
      conversations: Number(row?.conversations ?? 0),
      openOffers: Number(row?.open_offers ?? 0),
      topListing: t
        ? {
            id: t.id,
            title: t.title,
            views7: Number(t.views7 ?? 0),
            primary_image_id: t.primary_image_id,
          }
        : null,
    };
  } catch {
    return empty;
  }
}

import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { query } from "@/lib/db";

const HASH_SALT = process.env.VIEW_IP_SALT ?? "ebikeflip-views";

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

import "server-only";
import { query } from "@/lib/db";
import { listingIsSampleSql } from "@/lib/admin-test-data";

/**
 * Admin region management data layer — gives regions the same depth as
 * dress management: assignment status, the partner who runs each region,
 * the free-window / platform-fee lifecycle, and live activity.
 */

export type RegionListRow = {
  id: string;
  slug: string;
  label: string;
  short_name: string | null;
  sort_order: number;
  is_active: boolean;
  assigned: boolean;
  partner_email: string | null;
  partner_name: string | null;
  listing_fee_cents: number | null;
  free_until: string | null;
  platform_fee_pct: number | null;
  in_free: boolean;
  active_listings: number;
  pending_apps: number;
};

export async function listRegionsWithDetail(): Promise<RegionListRow[]> {
  try {
    const r = await query<{
      id: string;
      slug: string;
      label: string;
      short_name: string | null;
      sort_order: number;
      is_active: boolean;
      assigned: boolean;
      partner_email: string | null;
      first_name: string | null;
      surname: string | null;
      listing_fee_cents: number | null;
      free_until: string | null;
      platform_fee_pct: string | null;
      in_free: boolean;
      active_listings: string;
      pending_apps: string;
    }>(
      `SELECT r.id::text, r.slug, r.label, r.short_name, r.sort_order, r.is_active,
              (pmr.user_id IS NOT NULL)            AS assigned,
              u.email                              AS partner_email,
              u.first_name, u.surname,
              pmr.listing_fee_cents,
              pmr.free_until::text                 AS free_until,
              pmr.platform_fee_pct,
              (pmr.free_until > NOW())             AS in_free,
              (SELECT COUNT(*) FROM listings l
                 WHERE l.region_id = r.id AND l.is_draft = FALSE
                   AND l.is_published = TRUE AND l.sold_at IS NULL)::text
                                                   AS active_listings,
              (SELECT COUNT(*) FROM partner_applications a
                 WHERE a.region_id = r.id AND a.status = 'pending')::text
                                                   AS pending_apps
         FROM regions r
         LEFT JOIN partner_marketing_regions pmr ON pmr.region_id = r.id
         LEFT JOIN users u ON u.id = pmr.user_id
        ORDER BY r.sort_order, r.id`,
    );
    return r.rows.map((x) => ({
      id: x.id,
      slug: x.slug,
      label: x.label,
      short_name: x.short_name,
      sort_order: x.sort_order,
      is_active: x.is_active,
      assigned: x.assigned,
      partner_email: x.partner_email,
      partner_name: [x.first_name, x.surname].filter(Boolean).join(" ") || null,
      listing_fee_cents: x.listing_fee_cents,
      free_until: x.free_until,
      platform_fee_pct: x.platform_fee_pct === null ? null : Number(x.platform_fee_pct),
      in_free: x.in_free === true,
      active_listings: Number(x.active_listings ?? 0),
      pending_apps: Number(x.pending_apps ?? 0),
    }));
  } catch {
    return [];
  }
}

export type RegionConfig = {
  id: string;
  slug: string;
  label: string;
  short_name: string | null;
  match_pattern: string | null;
  sort_order: number;
  is_active: boolean;
  is_test: boolean;
};

export type RegionPartner = {
  user_id: string;
  email: string;
  name: string | null;
  listing_fee_cents: number;
  activated_at: string | null;
  free_until: string | null;
  platform_fee_pct: number;
};

export type RegionStats = {
  active: number;
  sold: number;
  gmv_cents: number;
  sellers: number;
};

export type RegionListing = {
  id: string;
  title: string | null;
  designer_name: string | null;
  model: string | null;
  price_cents: number;
  sold_at: string | null;
  is_published: boolean;
  primary_image_id: string | null;
};

export type RegionApplication = {
  id: string;
  user_email: string;
  business_name: string | null;
  pitch: string | null;
  expected_inventory: string | null;
  created_at: string;
};

export type RegionDetail = {
  config: RegionConfig;
  partner: RegionPartner | null;
  stats: RegionStats;
  listings: RegionListing[];
  pendingApplications: RegionApplication[];
};

export async function getRegionDetail(
  id: string,
  showSamples = false,
): Promise<RegionDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  // The Activity card hides seeded sample/sandbox listings by default; the
  // toggle on the page flips it. (In a test region everything is sample, so
  // the default view is empty until you toggle it on.)
  const sampleFilter = showSamples ? "" : `AND NOT ${listingIsSampleSql("l")}`;
  try {
    const cfg = await query<RegionConfig>(
      `SELECT id::text, slug, label, short_name, match_pattern, sort_order, is_active, is_test
         FROM regions WHERE id = $1::bigint LIMIT 1`,
      [id],
    );
    if (cfg.rows.length === 0) return null;

    const [partnerRes, statsRes, listingsRes, appsRes] = await Promise.all([
      query<{
        user_id: string;
        email: string;
        first_name: string | null;
        surname: string | null;
        listing_fee_cents: number;
        activated_at: string | null;
        free_until: string | null;
        platform_fee_pct: string;
      }>(
        `SELECT pmr.user_id::text, u.email, u.first_name, u.surname,
                pmr.listing_fee_cents, pmr.activated_at::text, pmr.free_until::text,
                pmr.platform_fee_pct
           FROM partner_marketing_regions pmr
           JOIN users u ON u.id = pmr.user_id
          WHERE pmr.region_id = $1::bigint LIMIT 1`,
        [id],
      ),
      query<{ active: string; sold: string; gmv: string; sellers: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE l.is_published AND l.sold_at IS NULL)::text AS active,
           COUNT(*) FILTER (WHERE l.sold_at IS NOT NULL)::text               AS sold,
           COALESCE(SUM(l.price_cents) FILTER (WHERE l.sold_at IS NOT NULL),0)::text AS gmv,
           COUNT(DISTINCT l.seller_id) FILTER (WHERE l.is_published AND l.sold_at IS NULL)::text AS sellers
         FROM listings l
          WHERE l.region_id = $1::bigint AND l.is_draft = FALSE ${sampleFilter}`,
        [id],
      ),
      query<RegionListing>(
        `SELECT l.id::text, l.title, d.name AS designer_name, dr.model,
                l.price_cents, l.sold_at::text, l.is_published,
                (SELECT li.id::text FROM listing_images li
                   WHERE li.listing_id = l.id
                   ORDER BY li.is_primary DESC, li.position, li.id LIMIT 1)
                  AS primary_image_id
           FROM listings l
           JOIN dresses dr ON dr.id = l.dress_id
           LEFT JOIN designers d ON d.id = dr.designer_id
          WHERE l.region_id = $1::bigint AND l.is_draft = FALSE ${sampleFilter}
          ORDER BY l.created_at DESC LIMIT 12`,
        [id],
      ),
      query<RegionApplication>(
        `SELECT a.id::text, u.email AS user_email, a.business_name, a.pitch,
                a.expected_inventory, a.created_at::text
           FROM partner_applications a JOIN users u ON u.id = a.user_id
          WHERE a.region_id = $1::bigint AND a.status = 'pending'
          ORDER BY a.created_at DESC`,
        [id],
      ),
    ]);

    const p = partnerRes.rows[0];
    const s = statsRes.rows[0];
    return {
      config: cfg.rows[0]!,
      partner: p
        ? {
            user_id: p.user_id,
            email: p.email,
            name: [p.first_name, p.surname].filter(Boolean).join(" ") || null,
            listing_fee_cents: p.listing_fee_cents,
            activated_at: p.activated_at,
            free_until: p.free_until,
            platform_fee_pct: Number(p.platform_fee_pct ?? 0),
          }
        : null,
      stats: {
        active: Number(s?.active ?? 0),
        sold: Number(s?.sold ?? 0),
        gmv_cents: Number(s?.gmv ?? 0),
        sellers: Number(s?.sellers ?? 0),
      },
      listings: listingsRes.rows,
      pendingApplications: appsRes.rows,
    };
  } catch {
    return null;
  }
}

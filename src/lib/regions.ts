import "server-only";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getAnonymousLocation } from "@/lib/geo";
import { getCurrentUser } from "@/lib/auth";

export const REGION_COOKIE = "region_id";

export type Region = {
  id: string;
  slug: string;
  label: string;
  short_name: string | null;
  match_pattern: string | null;
  sort_order: number;
  is_active: boolean;
};

/** Human-friendly short name for prose ("Austin Metro"). Falls back to label. */
export function regionShortName(r: Region): string {
  return r.short_name && r.short_name.length > 0 ? r.short_name : r.label;
}

export async function listActiveRegions(): Promise<Region[]> {
  try {
    const result = await query<Region>(
      `SELECT id::text, slug, label, short_name, match_pattern, sort_order, is_active
         FROM regions
        WHERE is_active = TRUE
        ORDER BY sort_order, id`,
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function listAllRegions(): Promise<Region[]> {
  try {
    const result = await query<Region>(
      `SELECT id::text, slug, label, short_name, match_pattern, sort_order, is_active
         FROM regions
        ORDER BY sort_order, id`,
    );
    return result.rows;
  } catch {
    return [];
  }
}

/** Region ids assigned as 'marketing regions' to a partner account.
 *  Empty for non-partners or partners with none set yet. */
export async function getPartnerMarketingRegionIds(
  userId: string,
): Promise<string[]> {
  if (!/^\d+$/.test(userId)) return [];
  try {
    const result = await query<{ region_id: string }>(
      `SELECT region_id::text AS region_id
         FROM partner_marketing_regions
        WHERE user_id = $1::bigint`,
      [userId],
    );
    return result.rows.map((r) => r.region_id);
  } catch {
    return [];
  }
}

export type PartnerRegion = {
  id: string;
  label: string;
  /** Listing fee in cents the partner charges in this region; 0 = free. */
  listingFeeCents: number;
  /** End of the free window (ISO), null for legacy rows. */
  freeUntil: string | null;
  /** Platform-fee % that applies after the free window. */
  platformFeePct: number;
};

/** A partner's assigned marketing regions with their configured listing
 *  fee and free-period info, ordered for display. Empty for non-partners. */
export async function getPartnerRegions(
  userId: string,
): Promise<PartnerRegion[]> {
  if (!/^\d+$/.test(userId)) return [];
  try {
    const result = await query<{
      id: string;
      label: string;
      listing_fee_cents: number;
      free_until: string | null;
      platform_fee_pct: string | null;
    }>(
      `SELECT r.id::text          AS id,
              r.label             AS label,
              pmr.listing_fee_cents,
              pmr.free_until::text AS free_until,
              pmr.platform_fee_pct
         FROM partner_marketing_regions pmr
         JOIN regions r ON r.id = pmr.region_id
        WHERE pmr.user_id = $1::bigint
        ORDER BY r.sort_order, r.id`,
      [userId],
    );
    return result.rows.map((r) => ({
      id: r.id,
      label: r.label,
      listingFeeCents: Number(r.listing_fee_cents ?? 0),
      freeUntil: r.free_until,
      platformFeePct: Number(r.platform_fee_pct ?? 0),
    }));
  } catch {
    return [];
  }
}

/** The listing fee (in cents) the partner who markets `regionId` charges
 *  sellers there. Returns 0 when no partner markets the region, the
 *  partner left it free, or on any lookup error — i.e. "no fee owed" is
 *  the safe default. region_id is unique in partner_marketing_regions, so
 *  at most one row matches. */
export async function getRegionListingFeeCents(
  regionId: string | null,
): Promise<number> {
  if (!regionId || !/^\d+$/.test(regionId)) return 0;
  try {
    const result = await query<{ listing_fee_cents: number }>(
      `SELECT listing_fee_cents
         FROM partner_marketing_regions
        WHERE region_id = $1::bigint
        LIMIT 1`,
      [regionId],
    );
    return Number(result.rows[0]?.listing_fee_cents ?? 0);
  } catch {
    return 0;
  }
}

/** Map of region_id → the partner who already markets it, EXCLUDING
 *  `excludeUserId`. Used by the admin partner editor to grey out regions
 *  that are already taken (a region can belong to at most one partner). */
export async function getRegionPartnerOwners(
  excludeUserId: string,
): Promise<Record<string, { userId: string; email: string }>> {
  if (!/^\d+$/.test(excludeUserId)) return {};
  try {
    const result = await query<{
      region_id: string;
      user_id: string;
      email: string;
    }>(
      `SELECT pmr.region_id::text AS region_id,
              u.id::text          AS user_id,
              u.email             AS email
         FROM partner_marketing_regions pmr
         JOIN users u ON u.id = pmr.user_id
        WHERE pmr.user_id <> $1::bigint`,
      [excludeUserId],
    );
    const map: Record<string, { userId: string; email: string }> = {};
    for (const r of result.rows) {
      map[r.region_id] = { userId: r.user_id, email: r.email };
    }
    return map;
  } catch {
    return {};
  }
}

export function matchRegion(regions: Region[], ipLocation: string): Region | null {
  if (!ipLocation) return null;
  const lower = ipLocation.toLowerCase();
  for (const r of regions) {
    if (!r.match_pattern) continue;
    const patterns = r.match_pattern
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (patterns.some((p) => lower.includes(p))) return r;
  }
  return null;
}

/** SQL predicate that excludes listings sitting in a sandbox/test region.
 *  Param-free — AND it into the WHERE of any listings query (`alias` is the
 *  listings table alias). Sandbox inventory must never leak onto public
 *  surfaces (browse, home, seller profiles, sitemap, saved-search digests). */
export function excludeTestRegionsSql(alias = "l"): string {
  return `NOT EXISTS (SELECT 1 FROM regions rg_t WHERE rg_t.id = ${alias}.region_id AND rg_t.is_test)`;
}

/** A sandbox/test region a user is allowed to enter: the prospect it was
 *  provisioned for (sandbox_user_id), or any test region for an admin who's
 *  trialing it. Returns null when the id isn't a test region or the viewer
 *  isn't entitled to it. Test regions are is_active = FALSE, so they never
 *  surface via the normal active-region path. */
async function resolveSandboxRegion(regionId: string): Promise<Region | null> {
  try {
    const res = await query<Region & { sandbox_user_id: string | null }>(
      `SELECT id::text, slug, label, short_name, match_pattern, sort_order,
              is_active, sandbox_user_id::text AS sandbox_user_id
         FROM regions
        WHERE id = $1::bigint AND is_test = TRUE
        LIMIT 1`,
      [regionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const user = await getCurrentUser();
    if (!user) return null;
    if (!user.isAdmin && row.sandbox_user_id !== user.id) return null;
    return {
      id: row.id,
      slug: row.slug,
      label: row.label,
      short_name: row.short_name,
      match_pattern: row.match_pattern,
      sort_order: row.sort_order,
      is_active: row.is_active,
    };
  } catch {
    return null;
  }
}

/** The sandbox/test region provisioned for a user (its owner), if any.
 *  Drives the "enter your sandbox" banner. */
export async function getSandboxRegionForUser(
  userId: string,
): Promise<Region | null> {
  if (!/^\d+$/.test(userId)) return null;
  try {
    const res = await query<Region>(
      `SELECT id::text, slug, label, short_name, match_pattern, sort_order,
              is_active
         FROM regions
        WHERE is_test = TRUE AND sandbox_user_id = $1::bigint
        ORDER BY id
        LIMIT 1`,
      [userId],
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** The sandbox/test region the viewer is *currently inside* (their region
 *  cookie points at a test region they're entitled to). null otherwise.
 *  Drives the global "you're in the sandbox" banner + exit control. */
export async function getCurrentTestRegion(): Promise<Region | null> {
  const jar = await cookies();
  const cookieId = jar.get(REGION_COOKIE)?.value;
  if (!cookieId || !/^\d+$/.test(cookieId)) return null;
  return resolveSandboxRegion(cookieId);
}

export type ResolvedRegion =
  | { kind: "selected"; region: Region }
  | { kind: "auto"; region: Region; ipLocation: string }
  | { kind: "needs-pick"; ipLocation: string | null; regions: Region[] };

export async function resolveCurrentRegion(): Promise<ResolvedRegion> {
  const regions = await listActiveRegions();
  if (regions.length === 0) {
    // No regions configured yet — treat as ungated.
    return { kind: "needs-pick", ipLocation: null, regions: [] };
  }

  // 1. Explicit pick wins. The picker stamps a region_id cookie.
  const jar = await cookies();
  const cookieId = jar.get(REGION_COOKIE)?.value;
  if (cookieId && /^\d+$/.test(cookieId)) {
    const selected = regions.find((r) => r.id === cookieId);
    if (selected) return { kind: "selected", region: selected };
    // Not an active region — it may be a sandbox/test region the current
    // user is entitled to enter (its owner trialing it, or an admin).
    const sandbox = await resolveSandboxRegion(cookieId);
    if (sandbox) return { kind: "selected", region: sandbox };
  }

  // 2. IP-derived location. Same flow for anonymous and logged-in users —
  //    if they want to override the IP guess, they pick via the picker
  //    (cookie wins on next request).
  const ipLoc = await getAnonymousLocation();
  if (ipLoc) {
    const matched = matchRegion(regions, ipLoc);
    if (matched) return { kind: "auto", region: matched, ipLocation: ipLoc };
  }

  return { kind: "needs-pick", ipLocation: ipLoc, regions };
}

export async function getCurrentRegionId(): Promise<string | null> {
  const r = await resolveCurrentRegion();
  if (r.kind === "selected" || r.kind === "auto") return r.region.id;
  return null;
}

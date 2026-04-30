import "server-only";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnonymousLocation } from "@/lib/geo";

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

  // 1. Explicit pick wins. The picker stamps a region_id cookie that
  //    overrides everything else, including profile location.
  const jar = await cookies();
  const cookieId = jar.get(REGION_COOKIE)?.value;
  if (cookieId && /^\d+$/.test(cookieId)) {
    const selected = regions.find((r) => r.id === cookieId);
    if (selected) return { kind: "selected", region: selected };
  }

  // 2. Profile location (logged-in users). When set, it overrides the
  //    IP-derived session location: the user has told us where they are.
  //    If the profile location doesn't match any region, fall through to
  //    the picker — don't silently drop back to IP geo, since profile is
  //    authoritative.
  const user = await getCurrentUser();
  if (user?.location) {
    const matched = matchRegion(regions, user.location);
    if (matched) {
      return { kind: "auto", region: matched, ipLocation: user.location };
    }
    return { kind: "needs-pick", ipLocation: user.location, regions };
  }

  // 3. IP-derived location (anonymous, or logged-in user with no profile
  //    location set yet).
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

import "server-only";
import { excludeTestRegionsSql, getCurrentRegionId } from "@/lib/regions";
import type { ActiveFilters } from "@/lib/listings-filter-types";

export type RawBrowseParams = {
  q?: string | string[];
  designer_id?: string | string[];
  occasion_id?: string | string[];
  silhouette_id?: string | string[];
  size_id?: string | string[];
  condition_id?: string | string[];
  length_id?: string | string[];
  color?: string | string[];
  min_price?: string | string[];
  max_price?: string | string[];
  visibility?: string | string[];
  mode?: string | string[];
  trust_status?: string | string[];
};

export type BrowseMode = "for-sale" | "sold" | "shortlist";

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).filter((s) => s.length > 0);
}

function asScalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
}

function validIds(arr: string[]): string[] {
  return arr.filter((s) => /^\d+$/.test(s));
}

function validInt(
  s: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function parseBrowseMode(raw: RawBrowseParams): BrowseMode {
  const rawMode = asScalar(raw.mode);
  return rawMode === "sold"
    ? "sold"
    : rawMode === "shortlist"
      ? "shortlist"
      : "for-sale";
}

/**
 * Single source of truth for translating a /listings query-string
 * into a (whereSql, params, active) trio. Shared between the
 * server-rendered browse page and the /api/listings/count endpoint
 * that powers the live filter-result count.
 */
export async function buildBrowseFilters(
  raw: RawBrowseParams,
  opts: { isAdmin: boolean; userId: string | null },
): Promise<{
  active: ActiveFilters;
  mode: BrowseMode;
  whereSql: string;
  params: unknown[];
  regionId: string | null;
}> {
  const { isAdmin, userId } = opts;
  const mode = parseBrowseMode(raw);
  const where: string[] = [];
  const params: unknown[] = [];
  const active: ActiveFilters = {};

  where.push("l.is_draft = FALSE");

  if (mode === "sold") {
    where.push("l.sold_at IS NOT NULL");
  } else if (mode === "shortlist") {
    if (userId) {
      params.push(userId);
      where.push(
        `EXISTS (SELECT 1 FROM shortlists s
          WHERE s.user_id = $${params.length}::bigint
            AND s.listing_id = l.id
            AND s.ignored_at IS NULL)`,
      );
    } else {
      where.push("FALSE");
    }
  } else {
    where.push("l.sold_at IS NULL");
  }

  if (isAdmin) {
    const v = asScalar(raw.visibility);
    if (v === "published") {
      where.push("l.is_published = TRUE");
      active.visibility = "published";
    } else if (v === "hidden") {
      where.push("l.is_published = FALSE");
      active.visibility = "hidden";
    } else {
      active.visibility = "all";
    }
  } else {
    where.push("l.is_published = TRUE");
    where.push("l.trust_status <> 'flagged'");
  }

  const pushClause = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
  };

  const trustStatusRaw = asScalar(raw.trust_status);
  if (trustStatusRaw === "verified" || trustStatusRaw === "authenticated") {
    pushClause(`l.trust_status = $?`, trustStatusRaw);
    active.trustStatus = trustStatusRaw;
  }

  const q = asScalar(raw.q)?.slice(0, 120).trim();
  if (q) {
    active.q = q;
    params.push(`%${escapeLike(q)}%`);
    const n = params.length;
    where.push(
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR dr.model ILIKE $${n} ESCAPE '\\' OR d.name ILIKE $${n} ESCAPE '\\')`,
    );
  }

  const addArrayFilter = (
    column: string,
    rawArr: string[],
    key:
      | "designer_id"
      | "occasion_id"
      | "silhouette_id"
      | "size_id"
      | "condition_id"
      | "length_id",
  ) => {
    const ids = validIds(rawArr);
    if (ids.length === 0) return;
    active[key] = ids;
    params.push(ids.map((s) => Number(s)));
    where.push(`${column} = ANY($${params.length}::bigint[])`);
  };

  addArrayFilter("dr.designer_id", asArray(raw.designer_id), "designer_id");
  addArrayFilter("l.occasion_id", asArray(raw.occasion_id), "occasion_id");
  addArrayFilter("dr.silhouette_id", asArray(raw.silhouette_id), "silhouette_id");
  addArrayFilter("dr.size_id", asArray(raw.size_id), "size_id");
  addArrayFilter("l.condition_id", asArray(raw.condition_id), "condition_id");
  addArrayFilter("dr.length_id", asArray(raw.length_id), "length_id");

  const colorLabels = asArray(raw.color)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 64)
    .slice(0, 20);
  if (colorLabels.length > 0) {
    active.color = colorLabels;
    params.push(colorLabels);
    where.push(`dr.color = ANY($${params.length}::text[])`);
  }

  const minPrice = validInt(asScalar(raw.min_price), 0, 10_000_000);
  if (minPrice !== undefined) {
    active.min_price = String(minPrice);
    pushClause("l.price_cents >= $?", minPrice * 100);
  }
  const maxPrice = validInt(asScalar(raw.max_price), 0, 10_000_000);
  if (maxPrice !== undefined) {
    active.max_price = String(maxPrice);
    pushClause("l.price_cents <= $?", maxPrice * 100);
  }

  // Region scope (non-admin only; sellers always see their own
  // listings regardless of region).
  const regionId = !isAdmin ? await getCurrentRegionId() : null;
  if (regionId) {
    params.push(regionId);
    const regionParam = `$${params.length}::bigint`;
    if (userId) {
      params.push(userId);
      const userParam = `$${params.length}::bigint`;
      where.push(`(l.region_id = ${regionParam} OR l.seller_id = ${userParam})`);
    } else {
      where.push(`l.region_id = ${regionParam}`);
    }
  }

  // Keep sandbox/test-region inventory out of public browse. The lone
  // exception is the region the viewer is currently in — a sandbox owner
  // browsing their own test region (resolved above) still sees its
  // listings. Admins are unscoped and see everything.
  if (!isAdmin) {
    if (regionId) {
      params.push(regionId);
      where.push(`(${excludeTestRegionsSql("l")} OR l.region_id = $${params.length}::bigint)`);
    } else {
      where.push(excludeTestRegionsSql("l"));
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  return { active, mode, whereSql, params, regionId };
}

import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findRefTable, listActiveRefOptions } from "@/lib/ref-data";
import { getCurrentRegionId } from "@/lib/regions";
import { getShortlistIds } from "@/lib/shortlist";
import { ButtonLink } from "../_components/ui";
import {
  ListingCard,
  ListingRow,
  listingFromRow,
  type ListingCardRow,
} from "../_components/listing-card";
import {
  ListingsFilters,
  activeFilterCount,
  type ActiveFilters,
} from "../_components/listings-filters";
import { ViewToggle, type ListingsView } from "../_components/view-toggle";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

type RawSearchParams = {
  q?: string | string[];
  make_id?: string | string[];
  bike_class_id?: string | string[];
  bike_category_id?: string | string[];
  condition_id?: string | string[];
  min_price?: string | string[];
  max_price?: string | string[];
  min_year?: string | string[];
  max_year?: string | string[];
  view?: string | string[];
  visibility?: string | string[];
  mode?: string | string[];
};

type BrowseMode = "for-sale" | "sold";

function buildModeHref(mode: BrowseMode, sp: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "mode" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v) params.append(key, v);
    } else if (value) {
      params.set(key, value);
    }
  }
  if (mode === "sold") params.set("mode", "sold");
  const qs = params.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

function buildViewHref(view: ListingsView, sp: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "view" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v) params.append(key, v);
    } else if (value) {
      params.set(key, value);
    }
  }
  if (view === "grid") params.set("view", "grid");
  const qs = params.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

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

function buildFilters(
  raw: RawSearchParams,
  isAdmin: boolean,
  mode: BrowseMode,
): {
  active: ActiveFilters;
  where: string[];
  params: unknown[];
} {
  // Non-admins only ever see published listings. Admins can request a
  // visibility filter explicitly via ?visibility=published|hidden, or
  // omit it (default "all") to see everything.
  const where: string[] = [];
  const params: unknown[] = [];
  const active: ActiveFilters = {};

  // For-sale vs sold split. Default = for-sale (sold_at IS NULL).
  if (mode === "sold") {
    where.push("l.sold_at IS NOT NULL");
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
  }

  const pushClause = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
  };

  // Text search (q): single param reused across columns.
  const q = asScalar(raw.q)?.slice(0, 120).trim();
  if (q) {
    active.q = q;
    params.push(`%${escapeLike(q)}%`);
    const n = params.length;
    where.push(
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR l.model ILIKE $${n} ESCAPE '\\' OR mk.name ILIKE $${n} ESCAPE '\\')`,
    );
  }

  // Multi-select FKs (use ANY)
  const addArrayFilter = (
    column: string,
    rawArr: string[],
    key:
      | "make_id"
      | "bike_class_id"
      | "bike_category_id"
      | "condition_id",
  ) => {
    const ids = validIds(rawArr);
    if (ids.length === 0) return;
    active[key] = ids;
    params.push(ids.map((s) => Number(s)));
    where.push(`${column} = ANY($${params.length}::bigint[])`);
  };

  addArrayFilter("l.make_id", asArray(raw.make_id), "make_id");
  addArrayFilter("l.bike_class_id", asArray(raw.bike_class_id), "bike_class_id");
  addArrayFilter(
    "l.bike_category_id",
    asArray(raw.bike_category_id),
    "bike_category_id",
  );
  addArrayFilter("l.condition_id", asArray(raw.condition_id), "condition_id");

  // Numeric ranges
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
  const minYear = validInt(asScalar(raw.min_year), 1990, MAX_YEAR);
  if (minYear !== undefined) {
    active.min_year = String(minYear);
    pushClause("l.year >= $?", minYear);
  }
  const maxYear = validInt(asScalar(raw.max_year), 1990, MAX_YEAR);
  if (maxYear !== undefined) {
    active.max_year = String(maxYear);
    pushClause("l.year <= $?", maxYear);
  }

  return { active, where, params };
}

async function fetchListings(
  whereSql: string,
  params: unknown[],
): Promise<
  | { ok: true; listings: ListingCardRow[] }
  | { ok: false; error: string }
> {
  try {
    const result = await query<ListingCardRow>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.seller_id::text,
              u.email AS seller_email,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              mk.name   AS make_name,
              l.model,
              l.year,
              cg.label  AS condition_label,
              bcl.label AS bike_class_label,
              bcat.label AS bike_category_label,
              l.location_postal,
              l.frame_size,
              fs.label  AS frame_style_label,
              fm.label  AS frame_material_label,
              gf.label  AS gender_fit_label,
              ws.label  AS wheel_size_label,
              st.label  AS suspension_type_label,
              bt.label  AS brake_type_label,
              mb.name   AS motor_brand_name,
              mt.label  AS motor_type_label,
              l.motor_watts_nominal,
              l.battery_wh,
              l.top_speed_mph,
              l.range_miles_min,
              l.range_miles_max,
              dm.label  AS drive_mode_label,
              l.mileage,
              l.color,
              l.weight_lbs::text,
              l.has_warranty,
              l.is_published,
              l.sold_at::text,
              (
                SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
                  WHERE listing_id = l.id
              ) AS conversation_count
         FROM listings l
         LEFT JOIN users            u    ON u.id    = l.seller_id
         LEFT JOIN bike_makes       mk   ON mk.id   = l.make_id
         LEFT JOIN condition_grades cg   ON cg.id   = l.condition_id
         LEFT JOIN bike_classes     bcl  ON bcl.id  = l.bike_class_id
         LEFT JOIN bike_categories  bcat ON bcat.id = l.bike_category_id
         LEFT JOIN frame_styles     fs   ON fs.id   = l.frame_style_id
         LEFT JOIN frame_materials  fm   ON fm.id   = l.frame_material_id
         LEFT JOIN gender_fits      gf   ON gf.id   = l.gender_fit_id
         LEFT JOIN wheel_sizes      ws   ON ws.id   = l.wheel_size_id
         LEFT JOIN suspension_types st   ON st.id   = l.suspension_type_id
         LEFT JOIN brake_types      bt   ON bt.id   = l.brake_type_id
         LEFT JOIN motor_brands     mb   ON mb.id   = l.motor_brand_id
         LEFT JOIN motor_types      mt   ON mt.id   = l.motor_type_id
         LEFT JOIN drive_modes      dm   ON dm.id   = l.drive_mode_id
         ${whereSql}
         ORDER BY l.created_at DESC
         LIMIT 50`,
      params,
    );
    return { ok: true, listings: result.rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

async function loadFilterOptions() {
  const get = async (key: string) => {
    const t = findRefTable(key);
    if (!t) return [];
    return listActiveRefOptions(t);
  };
  const [makes, classes, categories, conditions] = await Promise.all([
    get("bike-makes"),
    get("bike-classes"),
    get("bike-categories"),
    get("condition-grades"),
  ]);
  return { makes, classes, categories, conditions };
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;

  // Need user before building filters so admin gets the visibility option.
  const user = await getCurrentUser();
  const isAdmin = user?.isAdmin ?? false;

  const mode: BrowseMode =
    (Array.isArray(sp.mode) ? sp.mode[0] : sp.mode) === "sold"
      ? "sold"
      : "for-sale";

  const { active, where, params } = buildFilters(sp, isAdmin, mode);

  // Apply current region filter for non-admins. Strict — only listings in
  // the current region — but always include the viewer's own listings
  // regardless of region so a seller can manage stock across regions from
  // the main browse page. Admins see everything sitewide.
  if (!isAdmin) {
    const regionId = await getCurrentRegionId();
    if (regionId) {
      params.push(regionId);
      const regionParam = `$${params.length}::bigint`;
      if (user) {
        params.push(user.id);
        const userParam = `$${params.length}::bigint`;
        where.push(`(l.region_id = ${regionParam} OR l.seller_id = ${userParam})`);
      } else {
        where.push(`l.region_id = ${regionParam}`);
      }
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const view: ListingsView =
    (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "grid" ? "grid" : "cards";

  const [result, options, shortlistedIds] = await Promise.all([
    fetchListings(whereSql, params),
    loadFilterOptions(),
    getShortlistIds(user?.id),
  ]);

  const count = result.ok ? result.listings.length : 0;
  const filterCount = activeFilterCount(active);

  return (
    <div className="page page--pad">
      <div className="mode-toggle" role="group" aria-label="Browse mode">
        <Link
          href={buildModeHref("for-sale", sp)}
          className={`mode-toggle-btn ${mode === "for-sale" ? "is-active" : ""}`}
          aria-current={mode === "for-sale" ? "page" : undefined}
        >
          For sale
        </Link>
        <Link
          href={buildModeHref("sold", sp)}
          className={`mode-toggle-btn ${mode === "sold" ? "is-active" : ""}`}
          aria-current={mode === "sold" ? "page" : undefined}
        >
          Sold
        </Link>
      </div>

      <div className="browse-toolbar">
        <div className="left">
          <h3>{mode === "sold" ? "Recently sold" : "Browse eBikes"}</h3>
          {result.ok && (
            <span className="count">
              {count} {count === 1 ? "listing" : "listings"}
              {filterCount > 0 &&
                ` · ${filterCount} filter${filterCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        <div className="left">
          <ViewToggle current={view} hrefFor={(v) => buildViewHref(v, sp)} />
          {user ? (
            <ButtonLink
              href="/listings/new"
              variant="primary"
              size="sm"
              icon="plus"
            >
              New listing
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="dark" size="sm">
              Log in to post
            </ButtonLink>
          )}
        </div>
      </div>

      <ListingsFilters active={active} options={options} isAdmin={isAdmin} />

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load listings.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.listings.length === 0 ? (
        <div className="empty-state">
          <h3>
            {filterCount > 0
              ? "No matches"
              : mode === "sold"
                ? "Nothing sold yet"
                : "No listings yet"}
          </h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            {filterCount > 0
              ? "Try widening your filters or clearing the search."
              : mode === "sold"
                ? "When sellers mark their listings as sold, they'll show up here."
                : user
                  ? "Be the first to post one."
                  : "Register to post the first one."}
          </p>
          {filterCount > 0 ? (
            <ButtonLink
              href={buildModeHref(mode, {})}
              variant="primary"
              iconRight="arrow"
            >
              Clear filters
            </ButtonLink>
          ) : mode === "sold" ? (
            <ButtonLink href="/listings" variant="primary" iconRight="arrow">
              Browse for-sale listings
            </ButtonLink>
          ) : (
            <ButtonLink
              href={user ? "/listings/new" : "/register"}
              variant="primary"
              iconRight="arrow"
            >
              {user ? "Create listing" : "Register"}
            </ButtonLink>
          )}
        </div>
      ) : view === "grid" ? (
        <div className="results-rows">
          {result.listings.map((row) => (
            <ListingRow key={row.id} data={listingFromRow(row, user?.id, shortlistedIds)} />
          ))}
        </div>
      ) : (
        <div className="results-grid">
          {result.listings.map((row) => (
            <ListingCard key={row.id} data={listingFromRow(row, user?.id, shortlistedIds)} />
          ))}
        </div>
      )}
    </div>
  );
}

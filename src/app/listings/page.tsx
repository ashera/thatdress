import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import type { ColorOption, RefOption } from "@/lib/ref-data";
import {
  getCurrentRegionId,
  resolveCurrentRegion,
  regionShortName,
} from "@/lib/regions";
import { getShortlistIds } from "@/lib/shortlist";
import { Button, ButtonLink, Input } from "../_components/ui";
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
import {
  ListingsMap,
  type MapPostcodeBucket,
} from "../_components/listings-map";
import { saveSearch } from "@/lib/actions/saved-searches";
import { loadSiteSettings } from "@/lib/site-settings";

// 60s ISR — see /page.tsx note. Filtered URLs (?designer_id=...) get
// their own cache entries so popular filter combos hit DB once a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [r, baseUrl] = await Promise.all([
    resolveCurrentRegion(),
    getBaseUrl(),
  ]);
  const region =
    r.kind === "selected" || r.kind === "auto" ? r.region : null;
  const regionShort = region ? regionShortName(region) : null;
  const title = regionShort
    ? `Browse pre-loved formal dresses in ${regionShort}`
    : "Browse pre-loved formal dresses";
  const description = regionShort
    ? `Wedding-guest, black-tie, cocktail and bridesmaid dresses in ${regionShort} from real wardrobes — designer brands, honest condition, no listing fees.`
    : "Wedding-guest, black-tie, cocktail and bridesmaid dresses from real Australian wardrobes — designer brands, honest condition, no listing fees.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/listings` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/listings`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

type RawSearchParams = {
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
  view?: string | string[];
  visibility?: string | string[];
  mode?: string | string[];
  sort?: string | string[];
  trust_status?: string | string[];
};

type BrowseMode = "for-sale" | "sold" | "shortlist";

type SortOption = "newest" | "price-asc" | "price-desc";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

const SORT_SQL: Record<SortOption, string> = {
  newest: "l.created_at DESC",
  "price-asc": "l.price_cents ASC, l.created_at DESC",
  "price-desc": "l.price_cents DESC, l.created_at DESC",
};

function parseSort(raw: string | string[] | undefined): SortOption {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "price-asc" || v === "price-desc") return v;
  return "newest";
}

function buildSortHref(sort: SortOption, sp: RawSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "sort" || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v) params.append(key, v);
    } else if (value) {
      params.set(key, value);
    }
  }
  if (sort !== "newest") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

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
  if (mode !== "for-sale") params.set("mode", mode);
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
  if (view === "grid" || view === "map") params.set("view", view);
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
  userId: string | null,
): {
  active: ActiveFilters;
  where: string[];
  params: unknown[];
} {
  const where: string[] = [];
  const params: unknown[] = [];
  const active: ActiveFilters = {};

  // Drafts never belong on the browse page — even for admins. The
  // wizard / mine page is where in-progress listings are managed.
  where.push("l.is_draft = FALSE");

  // Mode: for-sale (default), sold, or shortlist (user's saved dresses).
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
      // Anonymous viewer: no shortlist exists, force empty result set.
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
    // Hide admin-flagged listings from public browse. Sellers keep
    // visibility of their own flagged listing via /listings/mine;
    // admins always see flagged ones (and have a dedicated queue at
    // /admin/listings/flagged).
    where.push("l.trust_status <> 'flagged'");
  }

  const pushClause = (clause: string, value: unknown) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
  };

  // Trust-status filter — supports a single value via ?trust_status=
  // (e.g. /listings?trust_status=verified from the buyer's checklist
  // CTA). Accepts the two non-default states; anything else is
  // ignored. Built off whichever values the listings_trust_status_check
  // constraint allows.
  const trustStatusRaw = asScalar(raw.trust_status);
  if (trustStatusRaw === "verified" || trustStatusRaw === "authenticated") {
    pushClause(`l.trust_status = $?`, trustStatusRaw);
    active.trustStatus = trustStatusRaw;
  }

  // Text search (q): single param reused across columns.
  const q = asScalar(raw.q)?.slice(0, 120).trim();
  if (q) {
    active.q = q;
    params.push(`%${escapeLike(q)}%`);
    const n = params.length;
    where.push(
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR dr.model ILIKE $${n} ESCAPE '\\' OR d.name ILIKE $${n} ESCAPE '\\')`,
    );
  }

  // Multi-select FKs (use ANY)
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

  // Colour is stored as a label string on dresses.color rather than
  // an FK, so the comparison runs against the text column directly.
  const colorLabels = asArray(raw.color)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 64)
    .slice(0, 20);
  if (colorLabels.length > 0) {
    active.color = colorLabels;
    params.push(colorLabels);
    where.push(`dr.color = ANY($${params.length}::text[])`);
  }

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

  return { active, where, params };
}

/**
 * Group the listings result by normalised postcode, then look up
 * each postcode's centroid from the `postcodes` table. Listings
 * whose postcode isn't in the table get counted as off-map so the
 * UI can prompt to expand the seed. Result is shaped for direct
 * consumption by <ListingsMap />.
 */
async function bucketByPostcode(
  listings: ListingCardRow[],
): Promise<{ buckets: MapPostcodeBucket[]; offMapCount: number }> {
  type Pending = {
    postcode: string;
    listings: MapPostcodeBucket["listings"];
  };
  const byPostcode = new Map<string, Pending>();
  for (const l of listings) {
    const code = (l.location_postal ?? "").trim().toUpperCase();
    if (!code) continue;
    let bucket = byPostcode.get(code);
    if (!bucket) {
      bucket = { postcode: code, listings: [] };
      byPostcode.set(code, bucket);
    }
    bucket.listings.push({
      id: l.id,
      title: l.title,
      price_cents: l.price_cents,
      primary_image_id: l.primary_image_id ?? null,
    });
  }
  if (byPostcode.size === 0) {
    return { buckets: [], offMapCount: 0 };
  }
  const codes = Array.from(byPostcode.keys());
  let rows: {
    postcode: string;
    place_name: string | null;
    latitude: string;
    longitude: string;
  }[] = [];
  try {
    const r = await query<{
      postcode: string;
      place_name: string | null;
      latitude: string;
      longitude: string;
    }>(
      `SELECT postcode, place_name,
              latitude::text  AS latitude,
              longitude::text AS longitude
         FROM postcodes
        WHERE country_code = 'AU'
          AND postcode = ANY($1::text[])`,
      [codes],
    );
    rows = r.rows;
  } catch {
    rows = [];
  }
  const coords = new Map(rows.map((r) => [r.postcode, r]));
  const buckets: MapPostcodeBucket[] = [];
  let offMapCount = 0;
  for (const [code, b] of byPostcode) {
    const c = coords.get(code);
    if (!c) {
      offMapCount += b.listings.length;
      continue;
    }
    buckets.push({
      postcode: code,
      place_name: c.place_name,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      listings: b.listings,
    });
  }
  return { buckets, offMapCount };
}

async function fetchListings(
  whereSql: string,
  params: unknown[],
  orderBy: string,
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
              d.name    AS designer_name,
              dr.model  AS model,
              dr.year   AS year,
              cg.label  AS condition_label,
              o.label   AS occasion_label,
              s.label   AS silhouette_label,
              f.label   AS fabric_label,
              ds.label  AS size_label,
              n.label   AS neckline_label,
              ss.label  AS sleeve_style_label,
              dl.label  AS length_label,
              l.location_postal,
              dr.color  AS color,
              dr.bust_cm::text  AS bust_cm,
              dr.waist_cm::text AS waist_cm,
              dr.hips_cm::text  AS hips_cm,
              dr.original_retail_cents AS original_retail_cents,
              l.has_original_receipt,
              l.trust_status,
              l.is_published,
              l.sold_at::text,
              l.is_featured,
              (
                SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
                  WHERE listing_id = l.id
              ) AS conversation_count,
              (
                SELECT ROUND(AVG(stars)::numeric, 1)::text
                  FROM listing_reviews
                  WHERE seller_id = l.seller_id
                    AND hidden_by_admin_at IS NULL
              ) AS seller_rating_avg,
              (
                SELECT COUNT(*)::text FROM listing_reviews
                  WHERE seller_id = l.seller_id
                    AND hidden_by_admin_at IS NULL
              ) AS seller_rating_count
         FROM listings l
         JOIN dresses dr  ON dr.id = l.dress_id
         LEFT JOIN users            u   ON u.id   = l.seller_id
         LEFT JOIN designers        d   ON d.id   = dr.designer_id
         LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
         LEFT JOIN occasions        o   ON o.id   = l.occasion_id
         LEFT JOIN silhouettes      s   ON s.id   = dr.silhouette_id
         LEFT JOIN fabrics          f   ON f.id   = dr.fabric_id
         LEFT JOIN dress_sizes      ds  ON ds.id  = dr.size_id
         LEFT JOIN necklines        n   ON n.id   = dr.neckline_id
         LEFT JOIN sleeve_styles    ss  ON ss.id  = dr.sleeve_style_id
         LEFT JOIN dress_lengths    dl  ON dl.id  = dr.length_id
         ${whereSql}
         ORDER BY l.is_featured DESC, ${orderBy}
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

/**
 * Filter options pruned to values that actually appear in at least
 * one live, for-sale, non-flagged listing. Stops the search panel
 * surfacing 47 designers when only 6 of them have anything listed.
 *
 * Predicate intentionally doesn't include the currently-applied
 * filters — if it did, ticking "Sage" would hide every other colour,
 * which makes adding a second filter feel broken. Region scoping
 * mirrors what the browse query does so the option counts agree
 * with the visible listing count.
 */
async function loadFilterOptions({
  isAdmin,
  regionId,
  userId,
}: {
  isAdmin: boolean;
  regionId: string | null;
  userId: string | null;
}) {
  // Live-listing predicate. Always-on conditions match the public
  // browse view; region scope only applies to non-admin.
  const params: unknown[] = [];
  const conds: string[] = [
    "l.is_draft = FALSE",
    "l.is_published = TRUE",
    "l.sold_at IS NULL",
    "l.trust_status <> 'flagged'",
  ];
  if (!isAdmin && regionId) {
    params.push(regionId);
    if (userId) {
      params.push(userId);
      conds.push(
        `(l.region_id = $${params.length - 1}::bigint OR l.seller_id = $${params.length}::bigint)`,
      );
    } else {
      conds.push(`l.region_id = $${params.length}::bigint`);
    }
  }
  const livePredicate = conds.join(" AND ");

  // Helper: ref table whose values are referenced by FK from either
  // listings.<col> or dresses.<col>.
  async function loadByFk(
    refTable: string,
    refLabelCol: string,
    fkTable: "dresses" | "listings",
    fkCol: string,
  ): Promise<RefOption[]> {
    const join =
      fkTable === "dresses" ? "JOIN dresses dr ON dr.id = l.dress_id" : "";
    const fkExpr = fkTable === "dresses" ? `dr.${fkCol}` : `l.${fkCol}`;
    const r = await query<{ id: string; label: string }>(
      `SELECT r.id::text AS id, r.${refLabelCol} AS label
         FROM ${refTable} r
        WHERE r.is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM listings l
            ${join}
             WHERE ${fkExpr} = r.id
               AND ${livePredicate}
          )
        ORDER BY LOWER(r.${refLabelCol}), r.id`,
      params,
    );
    return r.rows;
  }

  // Colours store labels (not FKs) on dresses.color, so the EXISTS
  // joins on a case-insensitive label match instead.
  async function loadColors(): Promise<ColorOption[]> {
    const r = await query<{ id: string; label: string; swatch: string | null }>(
      `SELECT c.id::text AS id, c.label, c.swatch_hex AS swatch
         FROM colors c
        WHERE c.is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM listings l
            JOIN dresses dr ON dr.id = l.dress_id
             WHERE LOWER(dr.color) = LOWER(c.label)
               AND ${livePredicate}
          )
        ORDER BY LOWER(c.label), c.id`,
      params,
    );
    return r.rows;
  }

  const [designers, occasions, silhouettes, sizes, conditions, lengths, colors] =
    await Promise.all([
      loadByFk("designers", "name", "dresses", "designer_id"),
      loadByFk("occasions", "label", "listings", "occasion_id"),
      loadByFk("silhouettes", "label", "dresses", "silhouette_id"),
      loadByFk("dress_sizes", "label", "dresses", "size_id"),
      loadByFk("condition_grades", "label", "listings", "condition_id"),
      loadByFk("dress_lengths", "label", "dresses", "length_id"),
      loadColors(),
    ]);
  return { designers, occasions, silhouettes, sizes, conditions, lengths, colors };
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

  const rawMode = Array.isArray(sp.mode) ? sp.mode[0] : sp.mode;
  const mode: BrowseMode =
    rawMode === "sold"
      ? "sold"
      : rawMode === "shortlist"
        ? "shortlist"
        : "for-sale";

  const { active, where, params } = buildFilters(
    sp,
    isAdmin,
    mode,
    user?.id ?? null,
  );

  // Apply current region filter for non-admins. Strict — only listings in
  // the current region — but always include the viewer's own listings
  // regardless of region so a seller can manage stock across regions from
  // the main browse page. Admins see everything sitewide.
  const regionId = !isAdmin ? await getCurrentRegionId() : null;
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

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const viewRaw = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: ListingsView =
    viewRaw === "grid" ? "grid" : viewRaw === "map" ? "map" : "cards";

  const sort = parseSort(sp.sort);
  const orderBy = SORT_SQL[sort];

  const [result, options, shortlistedIds, settings] = await Promise.all([
    fetchListings(whereSql, params, orderBy),
    loadFilterOptions({
      isAdmin,
      regionId,
      userId: user?.id ?? null,
    }),
    getShortlistIds(user?.id),
    loadSiteSettings(),
  ]);
  const reviewsThreshold = settings.reviewsDisplayThreshold;

  // Map view: bucket the listings by location_postal and look up
  // each postcode's centroid in the postcodes table. Only computed
  // when needed so the cards / grid view doesn't pay the cost.
  const mapData =
    view === "map" && result.ok
      ? await bucketByPostcode(result.listings)
      : null;

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
        <Link
          href={buildModeHref("shortlist", sp)}
          className={`mode-toggle-btn ${mode === "shortlist" ? "is-active" : ""}`}
          aria-current={mode === "shortlist" ? "page" : undefined}
        >
          Favourites
        </Link>
      </div>

      <div className="browse-toolbar">
        <div className="left">
          <h3>
            {mode === "sold"
              ? "Recently sold"
              : mode === "shortlist"
                ? "Your favourites"
                : "Browse dresses"}
          </h3>
          {result.ok && (
            <span className="count">
              {count} {count === 1 ? "listing" : "listings"}
              {filterCount > 0 &&
                ` · ${filterCount} filter${filterCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        <div className="left">
          <details className="sort-dropdown">
            <summary>
              <span className="sort-label">Sort:</span>{" "}
              <strong>{SORT_LABELS[sort]}</strong>
            </summary>
            <div className="sort-menu">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <Link
                  key={opt}
                  href={buildSortHref(opt, sp)}
                  className={opt === sort ? "is-active" : ""}
                >
                  {SORT_LABELS[opt]}
                </Link>
              ))}
            </div>
          </details>
          <ViewToggle current={view} hrefFor={(v) => buildViewHref(v, sp)} />
          {user ? (
            <ButtonLink
              href="/listings/mine"
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

      {user && filterCount > 0 && (
        <form action={saveSearch} className="save-search">
          <input
            type="hidden"
            name="params_json"
            value={JSON.stringify({ ...active, mode })}
          />
          <span className="save-search-label">
            Save this search to get email alerts when matching listings
            appear:
          </span>
          <Input
            type="text"
            name="name"
            maxLength={80}
            placeholder="e.g. Vera Wang under $500"
            required
          />
          <Button type="submit" variant="primary" size="sm" iconRight="check">
            Save
          </Button>
          <Link href="/alerts" className="save-search-link">
            Manage alerts
          </Link>
        </form>
      )}

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
                : mode === "shortlist"
                  ? user
                    ? "You haven't favourited anything yet"
                    : "Sign in to see your favourites"
                  : "No listings yet"}
          </h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            {filterCount > 0
              ? "Try widening your filters or clearing the search."
              : mode === "sold"
                ? "When sellers mark their listings as sold, they'll show up here."
                : mode === "shortlist"
                  ? user
                    ? "Tap the heart on any listing to save it for later."
                    : "Sign in to save listings and pick up where you left off."
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
          ) : mode === "shortlist" ? (
            <ButtonLink
              href={user ? "/listings" : "/login?next=/listings?mode=shortlist"}
              variant="primary"
              iconRight="arrow"
            >
              {user ? "Browse listings" : "Log in"}
            </ButtonLink>
          ) : (
            <ButtonLink
              href={user ? "/listings/mine" : "/register"}
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
            <ListingRow key={row.id} data={listingFromRow(row, user?.id, shortlistedIds, reviewsThreshold)} />
          ))}
        </div>
      ) : view === "map" && mapData ? (
        <ListingsMap
          buckets={mapData.buckets}
          offMapCount={mapData.offMapCount}
        />
      ) : (
        <div className="results-grid">
          {result.listings.map((row) => (
            <ListingCard key={row.id} data={listingFromRow(row, user?.id, shortlistedIds, reviewsThreshold)} />
          ))}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import type { ColorOption, RefOption } from "@/lib/ref-data";
import {
  excludeTestRegionsSql,
  resolveCurrentRegion,
  regionShortName,
} from "@/lib/regions";
import {
  buildBrowseFilters,
  type BrowseMode,
  type RawBrowseParams,
} from "@/lib/browse-filters";
import { getShortlistIds } from "@/lib/shortlist";
import { Button, ButtonLink, Input } from "../_components/ui";
import {
  ListingCard,
  ListingRow,
  listingFromRow,
  type ListingCardRow,
} from "../_components/listing-card";
import { ListingsFilters } from "../_components/listings-filters";
import {
  activeFilterCount,
  type ActiveFilters,
} from "@/lib/listings-filter-types";
import { ViewToggle, type ListingsView } from "../_components/view-toggle";
import {
  ListingsMap,
  type MapPostcodeBucket,
} from "../_components/listings-map";
import { saveSearch } from "@/lib/actions/saved-searches";
import { setRegion } from "@/lib/actions/regions";
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

type RawSearchParams = RawBrowseParams & {
  view?: string | string[];
  sort?: string | string[];
};

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

function asScalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length > 0 ? s : undefined;
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
              l.region_id::text AS region_id,
              rg.label AS region_label,
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
         LEFT JOIN regions          rg  ON rg.id  = l.region_id
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
  // Mirror the browse query's sandbox isolation so option counts agree with
  // the visible listings (exclude test-region inventory except the region
  // the viewer is currently in).
  if (!isAdmin) {
    if (regionId) {
      params.push(regionId);
      conds.push(`(${excludeTestRegionsSql("l")} OR l.region_id = $${params.length}::bigint)`);
    } else {
      conds.push(excludeTestRegionsSql("l"));
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

/**
 * Live listings the viewer has posted in regions OTHER than the one
 * they're currently browsing — these are filtered out of the grid by
 * the region scope, so we surface a banner letting the seller know (and
 * jump to that region). Grouped by region with counts.
 */
async function fetchSellerOtherRegionListings(
  userId: string,
  currentRegionId: string,
): Promise<{ regionId: string; label: string; count: number }[]> {
  if (!/^\d+$/.test(userId) || !/^\d+$/.test(currentRegionId)) return [];
  try {
    const r = await query<{ region_id: string; label: string; n: string }>(
      `SELECT rg.id::text AS region_id, rg.label AS label, COUNT(*)::text AS n
         FROM listings l
         JOIN regions rg ON rg.id = l.region_id
        WHERE l.seller_id = $1::bigint
          AND l.is_draft = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND l.region_id <> $2::bigint
        GROUP BY rg.id, rg.label
        ORDER BY rg.label`,
      [userId, currentRegionId],
    );
    return r.rows.map((x) => ({
      regionId: x.region_id,
      label: x.label,
      count: Number(x.n),
    }));
  } catch {
    return [];
  }
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

  const { active, mode, whereSql, params, regionId } = await buildBrowseFilters(
    sp,
    { isAdmin, userId: user?.id ?? null },
  );

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

  // Heads-up banner: the seller has live listings parked in other
  // regions that this region-scoped view hides. Only relevant to a
  // logged-in non-admin browsing a resolved region in the for-sale view.
  const otherRegionListings =
    user && !isAdmin && regionId && mode === "for-sale"
      ? await fetchSellerOtherRegionListings(user.id, regionId)
      : [];

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

      {otherRegionListings.length > 0 && (
        <div
          role="status"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--s-3)",
            margin: "0 0 var(--s-5)",
            padding: "var(--s-4) var(--s-5)",
            background: "var(--volt-50)",
            border: "1px solid var(--volt-100)",
            borderRadius: 12,
          }}
        >
          <span style={{ flex: "1 1 280px", color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>
            <span aria-hidden>📍 </span>
            You have{" "}
            <strong style={{ color: "var(--ink-1)" }}>
              {otherRegionListings.reduce((sum, r) => sum + r.count, 0)}
            </strong>{" "}
            live listing
            {otherRegionListings.reduce((sum, r) => sum + r.count, 0) === 1
              ? ""
              : "s"}{" "}
            in other regions. They&rsquo;re hidden here because buyers only see
            listings in their own region. Switch region to view them:
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {otherRegionListings.map((r) => (
              <form key={r.regionId} action={setRegion}>
                <input type="hidden" name="region_id" value={r.regionId} />
                <input type="hidden" name="next" value="/listings" />
                <button
                  type="submit"
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "var(--surface)",
                    color: "var(--ink-1)",
                    border: "1px solid var(--hairline-strong)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.label} ({r.count})
                </button>
              </form>
            ))}
            <Link
              href="/listings/mine"
              style={{
                alignSelf: "center",
                fontSize: 13,
                color: "var(--ink-2)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Manage all →
            </Link>
          </span>
        </div>
      )}

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
            <ListingRow key={row.id} data={listingFromRow(row, user?.id, shortlistedIds, reviewsThreshold, regionId)} />
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
            <ListingCard key={row.id} data={listingFromRow(row, user?.id, shortlistedIds, reviewsThreshold, regionId)} />
          ))}
        </div>
      )}
    </div>
  );
}

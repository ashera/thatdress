import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { findRefTable, listActiveRefOptions } from "@/lib/ref-data";
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
  min_price?: string | string[];
  max_price?: string | string[];
  view?: string | string[];
  visibility?: string | string[];
  mode?: string | string[];
  sort?: string | string[];
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
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR l.model ILIKE $${n} ESCAPE '\\' OR d.name ILIKE $${n} ESCAPE '\\')`,
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
      | "condition_id",
  ) => {
    const ids = validIds(rawArr);
    if (ids.length === 0) return;
    active[key] = ids;
    params.push(ids.map((s) => Number(s)));
    where.push(`${column} = ANY($${params.length}::bigint[])`);
  };

  addArrayFilter("l.designer_id", asArray(raw.designer_id), "designer_id");
  addArrayFilter("l.occasion_id", asArray(raw.occasion_id), "occasion_id");
  addArrayFilter("l.silhouette_id", asArray(raw.silhouette_id), "silhouette_id");
  addArrayFilter("l.size_id", asArray(raw.size_id), "size_id");
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

  return { active, where, params };
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
              l.model,
              l.year,
              cg.label  AS condition_label,
              o.label   AS occasion_label,
              s.label   AS silhouette_label,
              f.label   AS fabric_label,
              ds.label  AS size_label,
              n.label   AS neckline_label,
              ss.label  AS sleeve_style_label,
              dl.label  AS length_label,
              l.location_postal,
              l.color,
              l.bust_inches::text,
              l.waist_inches::text,
              l.hips_inches::text,
              l.original_retail_cents,
              l.has_original_receipt,
              l.trust_status,
              l.is_published,
              l.sold_at::text,
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
         LEFT JOIN users            u   ON u.id   = l.seller_id
         LEFT JOIN designers        d   ON d.id   = l.designer_id
         LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
         LEFT JOIN occasions        o   ON o.id   = l.occasion_id
         LEFT JOIN silhouettes      s   ON s.id   = l.silhouette_id
         LEFT JOIN fabrics          f   ON f.id   = l.fabric_id
         LEFT JOIN dress_sizes      ds  ON ds.id  = l.size_id
         LEFT JOIN necklines        n   ON n.id   = l.neckline_id
         LEFT JOIN sleeve_styles    ss  ON ss.id  = l.sleeve_style_id
         LEFT JOIN dress_lengths    dl  ON dl.id  = l.length_id
         ${whereSql}
         ORDER BY ${orderBy}
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
  const [designers, occasions, silhouettes, sizes, conditions] =
    await Promise.all([
      get("designers"),
      get("occasions"),
      get("silhouettes"),
      get("dress-sizes"),
      get("condition-grades"),
    ]);
  return { designers, occasions, silhouettes, sizes, conditions };
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

  const sort = parseSort(sp.sort);
  const orderBy = SORT_SQL[sort];

  const [result, options, shortlistedIds, settings] = await Promise.all([
    fetchListings(whereSql, params, orderBy),
    loadFilterOptions(),
    getShortlistIds(user?.id),
    loadSiteSettings(),
  ]);
  const reviewsThreshold = settings.reviewsDisplayThreshold;

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
          Shortlist
        </Link>
      </div>

      <div className="browse-toolbar">
        <div className="left">
          <h3>
            {mode === "sold"
              ? "Recently sold"
              : mode === "shortlist"
                ? "Your shortlist"
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
                    ? "Your shortlist is empty"
                    : "Sign in to see your shortlist"
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

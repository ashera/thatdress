import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findRefTable, listActiveRefOptions } from "@/lib/ref-data";
import { ButtonLink } from "../_components/ui";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "../_components/listing-card";
import {
  ListingsFilters,
  activeFilterCount,
  type ActiveFilters,
} from "../_components/listings-filters";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

type RawSearchParams = {
  make_id?: string;
  bike_class_id?: string;
  bike_category_id?: string;
  condition_id?: string;
  min_price?: string;
  max_price?: string;
  min_year?: string;
  max_year?: string;
};

function validId(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return /^\d+$/.test(s) ? s : undefined;
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

function buildFilters(raw: RawSearchParams): {
  active: ActiveFilters;
  where: string[];
  params: unknown[];
} {
  const where: string[] = [];
  const params: unknown[] = [];
  const active: ActiveFilters = {};

  const push = (clause: string, value: unknown, key: keyof ActiveFilters, raw: string) => {
    params.push(value);
    where.push(clause.replace("$?", `$${params.length}`));
    active[key] = raw;
  };

  const makeId = validId(raw.make_id);
  if (makeId) push("l.make_id = $?::bigint", makeId, "make_id", makeId);

  const classId = validId(raw.bike_class_id);
  if (classId)
    push("l.bike_class_id = $?::bigint", classId, "bike_class_id", classId);

  const categoryId = validId(raw.bike_category_id);
  if (categoryId)
    push(
      "l.bike_category_id = $?::bigint",
      categoryId,
      "bike_category_id",
      categoryId,
    );

  const conditionId = validId(raw.condition_id);
  if (conditionId)
    push("l.condition_id = $?::bigint", conditionId, "condition_id", conditionId);

  const minPrice = validInt(raw.min_price, 0, 10_000_000);
  if (minPrice !== undefined)
    push("l.price_cents >= $?", minPrice * 100, "min_price", String(minPrice));

  const maxPrice = validInt(raw.max_price, 0, 10_000_000);
  if (maxPrice !== undefined)
    push("l.price_cents <= $?", maxPrice * 100, "max_price", String(maxPrice));

  const minYear = validInt(raw.min_year, 1990, MAX_YEAR);
  if (minYear !== undefined)
    push("l.year >= $?", minYear, "min_year", String(minYear));

  const maxYear = validInt(raw.max_year, 1990, MAX_YEAR);
  if (maxYear !== undefined)
    push("l.year <= $?", maxYear, "max_year", String(maxYear));

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
              l.has_warranty
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
  const { active, where, params } = buildFilters(sp);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [result, user, options] = await Promise.all([
    fetchListings(whereSql, params),
    getCurrentUser(),
    loadFilterOptions(),
  ]);

  const count = result.ok ? result.listings.length : 0;
  const filterCount = activeFilterCount(active);

  return (
    <div className="page" style={{ padding: "var(--s-9) var(--s-7)" }}>
      <div className="browse-toolbar">
        <div className="left">
          <h3>Browse eBikes</h3>
          {result.ok && (
            <span className="count">
              {count} {count === 1 ? "listing" : "listings"}
              {filterCount > 0 && ` · ${filterCount} filter${filterCount === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        <div className="left">
          {user ? (
            <ButtonLink href="/listings/new" variant="primary" size="sm" icon="plus">
              New listing
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="dark" size="sm">
              Log in to post
            </ButtonLink>
          )}
        </div>
      </div>

      <ListingsFilters active={active} options={options} />

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load listings.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.listings.length === 0 ? (
        <div className="empty-state">
          <h3>{filterCount > 0 ? "No matches" : "No listings yet"}</h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            {filterCount > 0
              ? "Try widening your filters."
              : user
                ? "Be the first to post one."
                : "Register to post the first one."}
          </p>
          {filterCount > 0 ? (
            <ButtonLink href="/listings" variant="primary" iconRight="arrow">
              Clear filters
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
      ) : (
        <div className="results-grid">
          {result.listings.map((row) => (
            <ListingCard key={row.id} data={listingFromRow(row)} />
          ))}
        </div>
      )}
    </div>
  );
}

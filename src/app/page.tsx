import Image from "next/image";
import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getShortlistIds } from "@/lib/shortlist";
import { regionShortName, resolveCurrentRegion } from "@/lib/regions";
import { ButtonLink, Spec } from "./_components/ui";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "./_components/listing-card";

export const dynamic = "force-dynamic";

type SpecStats = {
  range_min: number | null;
  range_max: number | null;
  battery_min: number | null;
  battery_max: number | null;
  speed_min: number | null;
  speed_max: number | null;
  weight_min: number | null;
  weight_max: number | null;
};

async function getSpecStats(regionId: string | null): Promise<SpecStats> {
  try {
    const r = await query<{
      range_min: string | null;
      range_max: string | null;
      battery_min: string | null;
      battery_max: string | null;
      speed_min: string | null;
      speed_max: string | null;
      weight_min: string | null;
      weight_max: string | null;
    }>(
      `SELECT LEAST(
                MIN(NULLIF(range_miles_min, 0)),
                MIN(NULLIF(range_miles_max, 0))
              )::text AS range_min,
              GREATEST(
                MAX(NULLIF(range_miles_min, 0)),
                MAX(NULLIF(range_miles_max, 0))
              )::text AS range_max,
              MIN(NULLIF(battery_wh,    0))::text AS battery_min,
              MAX(NULLIF(battery_wh,    0))::text AS battery_max,
              MIN(NULLIF(top_speed_mph, 0))::text AS speed_min,
              MAX(NULLIF(top_speed_mph, 0))::text AS speed_max,
              MIN(NULLIF(weight_lbs,    0))::text AS weight_min,
              MAX(NULLIF(weight_lbs,    0))::text AS weight_max
         FROM listings
        WHERE is_published = TRUE
          AND sold_at IS NULL
          ${regionId ? "AND region_id = $1::bigint" : ""}`,
      regionId ? [regionId] : [],
    );
    const row = r.rows[0];
    const num = (s: string | null | undefined) =>
      s == null ? null : Number(s);
    return {
      range_min: num(row?.range_min),
      range_max: num(row?.range_max),
      battery_min: num(row?.battery_min),
      battery_max: num(row?.battery_max),
      speed_min: num(row?.speed_min),
      speed_max: num(row?.speed_max),
      weight_min: num(row?.weight_min),
      weight_max: num(row?.weight_max),
    };
  } catch {
    return {
      range_min: null,
      range_max: null,
      battery_min: null,
      battery_max: null,
      speed_min: null,
      speed_max: null,
      weight_min: null,
      weight_max: null,
    };
  }
}

function specRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min == null) return String(max);
  if (max == null || max === min) return String(min);
  const [low, high] = min <= max ? [min, max] : [max, min];
  return `${low}–${high}`;
}

async function getFeaturedListings(
  regionId: string | null,
): Promise<ListingCardRow[]> {
  try {
    const r = await query<ListingCardRow>(
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
              mk.name   AS make_name, l.model, l.year,
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
              l.sold_at::text
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
        WHERE l.is_published = TRUE
          AND l.sold_at IS NULL
          ${regionId ? "AND l.region_id = $1::bigint" : ""}
        ORDER BY l.created_at DESC
        LIMIT 4`,
      regionId ? [regionId] : [],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ account_deleted?: string }>;
}) {
  const { account_deleted: accountDeleted } = await searchParams;
  const [user, r] = await Promise.all([
    getCurrentUser(),
    resolveCurrentRegion(),
  ]);
  const region =
    r.kind === "selected" || r.kind === "auto" ? r.region : null;
  const regionShort = region ? regionShortName(region) : null;
  const regionId = region ? region.id : null;
  const [stats, featured, shortlistedIds] = await Promise.all([
    getSpecStats(regionId),
    getFeaturedListings(regionId),
    user ? getShortlistIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <div className="page">
      {accountDeleted && (
        <div
          className="form-success"
          style={{
            margin: "var(--s-4) auto 0",
            maxWidth: 720,
            textAlign: "center",
          }}
        >
          Your account has been deleted. Thanks for trying ebikeflip.
        </div>
      )}
      <section className="hero">
        <div className="hero-bike" aria-hidden>
          <Image
            src="/images/big-bike.png"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 100vw, 60vw"
          />
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Peer-to-peer eBike marketplace</p>
            {regionShort ? (
              <>
                <h1>
                  The <span className="accent">{regionShort}</span> eBike
                  marketplace.
                </h1>
                <p className="sub">
                  <strong>Always free</strong> to list and buy. Connect with
                  riders nearby — verified specs, honest condition, no listing
                  fees, no commission.
                </p>
              </>
            ) : (
              <>
                <h1>
                  Buy &amp; sell <span className="accent">used eBikes</span>{" "}
                  with people you can trust.
                </h1>
                <p className="sub">
                  <strong>Always free</strong> to list and buy. Verified
                  sellers, real specs, honest condition — built for commuters,
                  cargo riders, and weekend cruisers.
                </p>
              </>
            )}
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                marginTop: "var(--s-7)",
                flexWrap: "wrap",
              }}
            >
              <ButtonLink href="/listings" variant="primary" size="lg" iconRight="arrow">
                Browse listings
              </ButtonLink>
              <ButtonLink href="/listings/new" variant="ghost" size="lg" icon="plus">
                List your bike
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="section">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--s-3)",
              marginBottom: "var(--s-5)",
            }}
          >
            <div>
              <p className="eyebrow">Fresh on the marketplace</p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  color: "var(--ink-1)",
                  margin: "var(--s-2) 0 0",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                }}
              >
                {regionShort
                  ? `Latest in ${regionShort}`
                  : "Latest listings"}
              </h2>
            </div>
            <Link
              href="/listings"
              style={{
                color: "var(--ink-2)",
                fontSize: "var(--t-body-s)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              See all →
            </Link>
          </div>
          <div className="results-grid">
            {featured.map((row) => (
              <ListingCard
                key={row.id}
                data={listingFromRow(row, user?.id, shortlistedIds)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <p className="eyebrow">Built for honest deals</p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 44,
            color: "var(--ink-1)",
            margin: "0 0 var(--s-7)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            maxWidth: "20ch",
          }}
        >
          Real specs. <span style={{ color: "var(--volt-500)" }}>Real bikes.</span>
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--s-3)",
          }}
        >
          <Spec
            k="Range"
            v={specRange(stats.range_min, stats.range_max)}
            unit="km"
          />
          <Spec
            k="Battery"
            v={specRange(stats.battery_min, stats.battery_max)}
            unit="wh"
          />
          <Spec
            k="Top speed"
            v={specRange(stats.speed_min, stats.speed_max)}
            unit="km/h"
          />
          <Spec
            k="Weight"
            v={specRange(stats.weight_min, stats.weight_max)}
            unit="kg"
          />
        </div>
      </section>
    </div>
  );
}

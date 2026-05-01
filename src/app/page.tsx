import Image from "next/image";
import { query } from "@/lib/db";
import { regionShortName, resolveCurrentRegion } from "@/lib/regions";
import { ButtonLink, Spec } from "./_components/ui";

export const dynamic = "force-dynamic";

type SpecStats = {
  range_min: number | null;
  range_max: number | null;
  battery_min: number | null;
  battery_max: number | null;
  speed_min: number | null;
  speed_max: number | null;
  conditions: number;
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
      conditions: string;
    }>(
      `SELECT MIN(NULLIF(range_miles_min, 0))::text AS range_min,
              MAX(NULLIF(range_miles_max, 0))::text AS range_max,
              MIN(NULLIF(battery_wh,      0))::text AS battery_min,
              MAX(NULLIF(battery_wh,      0))::text AS battery_max,
              MIN(NULLIF(top_speed_mph,   0))::text AS speed_min,
              MAX(NULLIF(top_speed_mph,   0))::text AS speed_max,
              COUNT(DISTINCT condition_id)::text     AS conditions
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
      conditions: Number(row?.conditions ?? 0),
    };
  } catch {
    return {
      range_min: null,
      range_max: null,
      battery_min: null,
      battery_max: null,
      speed_min: null,
      speed_max: null,
      conditions: 0,
    };
  }
}

function specRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min == null) return String(max);
  if (max == null || max === min) return String(min);
  return `${min}–${max}`;
}

export default async function Home() {
  const r = await resolveCurrentRegion();
  const region =
    r.kind === "selected" || r.kind === "auto" ? r.region : null;
  const regionShort = region ? regionShortName(region) : null;
  const stats = await getSpecStats(region ? region.id : null);

  return (
    <div className="page">
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
            k="Conditions"
            v={stats.conditions > 0 ? String(stats.conditions) : "—"}
          />
        </div>
      </section>
    </div>
  );
}

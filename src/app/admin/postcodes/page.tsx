import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { importGeoNamesAUPostcodes } from "@/lib/actions/admin-postcodes";
import { Button, Field, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Postcodes — Admin" };

const ERROR_MESSAGES: Record<string, string> = {
  fetch:
    "Couldn't fetch the GeoNames archive — check the server logs for the HTTP status.",
  "fetch-failed":
    "The download / unzip step threw. Network outage, DNS issue, or a corrupted archive — check server logs.",
  "no-au-txt": "The downloaded zip didn't contain AU.txt.",
  "no-rows-parsed":
    "Parsed zero rows from AU.txt. The file format may have changed.",
};

type Summary = {
  total: number;
  withCoverage: number;
  topPlaces: Array<{ postcode: string; place_name: string | null }>;
};

async function loadSummary(): Promise<Summary> {
  try {
    const totalRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM postcodes WHERE country_code = 'AU'`,
    );
    const coverageRes = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT location_postal)::text AS count
         FROM listings
        WHERE is_draft = FALSE
          AND location_postal IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM postcodes p
             WHERE p.country_code = 'AU'
               AND p.postcode = UPPER(TRIM(listings.location_postal))
          )`,
    );
    const sampleRes = await query<{
      postcode: string;
      place_name: string | null;
    }>(
      `SELECT postcode, place_name
         FROM postcodes
        WHERE country_code = 'AU'
        ORDER BY postcode
        LIMIT 6`,
    );
    return {
      total: Number(totalRes.rows[0]?.count ?? 0),
      withCoverage: Number(coverageRes.rows[0]?.count ?? 0),
      topPlaces: sampleRes.rows,
    };
  } catch {
    return { total: 0, withCoverage: 0, topPlaces: [] };
  }
}

type LookupResult = {
  postcode: string;
  found: boolean;
  place_name: string | null;
  latitude: number | null;
  longitude: number | null;
  listingTotal: number;
  listingsLive: number;
  listingsSold: number;
};

/**
 * Single-postcode lookup. Returns 'found: false' when the postcode
 * isn't in the table — callers should surface that as 'no centroid
 * on file' so admins know to run the import. Listing counts are
 * computed against location_postal so admins can spot a postcode
 * that's actively used in the marketplace even when its centroid
 * is missing (a queue-the-import signal).
 */
async function lookupPostcode(code: string): Promise<LookupResult> {
  let row: {
    place_name: string | null;
    latitude: string;
    longitude: string;
  } | null = null;
  try {
    const r = await query<{
      place_name: string | null;
      latitude: string;
      longitude: string;
    }>(
      `SELECT place_name,
              latitude::text  AS latitude,
              longitude::text AS longitude
         FROM postcodes
        WHERE country_code = 'AU'
          AND postcode     = $1
        LIMIT 1`,
      [code],
    );
    row = r.rows[0] ?? null;
  } catch {
    row = null;
  }

  let listingTotal = 0;
  let listingsLive = 0;
  let listingsSold = 0;
  try {
    const r = await query<{
      total: string;
      live: string;
      sold: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (
                WHERE l.is_draft = FALSE
                  AND l.is_published = TRUE
                  AND l.sold_at IS NULL
              )::text AS live,
              COUNT(*) FILTER (WHERE l.sold_at IS NOT NULL)::text AS sold
         FROM listings l
        WHERE UPPER(TRIM(l.location_postal)) = $1`,
      [code],
    );
    const c = r.rows[0];
    listingTotal = Number(c?.total ?? 0);
    listingsLive = Number(c?.live ?? 0);
    listingsSold = Number(c?.sold ?? 0);
  } catch {
    // Ignore — leave counts at 0.
  }

  return {
    postcode: code,
    found: !!row,
    place_name: row?.place_name ?? null,
    latitude: row ? Number(row.latitude) : null,
    longitude: row ? Number(row.longitude) : null,
    listingTotal,
    listingsLive,
    listingsSold,
  };
}

export default async function AdminPostcodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    parsed?: string;
    inserted?: string;
    skipped?: string;
    bytes?: string;
    error?: string;
    status?: string;
    q?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const summary = await loadSummary();

  // Lookup form: normalise to alphanumeric uppercase and only
  // query when the shape is plausible.
  const rawQuery = (sp.q ?? "").trim();
  const lookupCode = rawQuery
    ? rawQuery.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
    : "";
  const lookup =
    lookupCode && /^[A-Z0-9]{3,8}$/.test(lookupCode)
      ? await lookupPostcode(lookupCode)
      : null;

  const flash = (() => {
    if (sp.ok) {
      const parsed = Number(sp.parsed ?? 0);
      const inserted = Number(sp.inserted ?? 0);
      const skipped = Number(sp.skipped ?? 0);
      const bytes = Number(sp.bytes ?? 0);
      const kb = Math.round(bytes / 1024);
      return {
        ok: true,
        text: `Imported ${inserted.toLocaleString()} new postcodes (${skipped.toLocaleString()} already present, ${parsed.toLocaleString()} parsed, ${kb}KB downloaded).`,
      };
    }
    if (sp.error) {
      const base = ERROR_MESSAGES[sp.error] ?? "Import failed.";
      const detail = sp.status ? ` HTTP ${sp.status}.` : "";
      return { ok: false, text: base + detail };
    }
    return null;
  })();

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Postcodes</p>
        <h1>Postcode centroids</h1>
        <p className="sub">
          Powers the map view on <code>/listings</code>. Each row holds
          a postcode + its centroid (lat/lng) + a place name; map
          markers cluster at these points. Schema ships with ~50 major
          AU postcodes seeded — import the full GeoNames AU dataset
          here to cover the long tail (~17,000 postcodes including
          rural and locked-bag codes).
        </p>
      </header>

      {flash && (
        <p
          className={flash.ok ? "form-success" : "form-error"}
          style={{ marginBottom: "var(--s-5)" }}
        >
          {flash.text}
        </p>
      )}

      <section
        className="form-card"
        style={{ marginBottom: "var(--s-5)" }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Coverage
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "var(--s-3)",
          }}
        >
          <Tile
            label="Postcodes on file"
            value={summary.total.toLocaleString()}
            hint="Distinct rows in the postcodes table"
          />
          <Tile
            label="Listings covered"
            value={summary.withCoverage.toLocaleString()}
            hint="Live listings whose location_postal resolves to a centroid"
          />
        </div>
        {summary.topPlaces.length > 0 && (
          <p
            style={{
              marginTop: "var(--s-3)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--ink-4)",
              letterSpacing: "0.04em",
            }}
          >
            Sample:{" "}
            {summary.topPlaces
              .map(
                (p) =>
                  `${p.postcode}${p.place_name ? ` ${p.place_name}` : ""}`,
              )
              .join(", ")}
            …
          </p>
        )}
      </section>

      <section
        className="form-card"
        style={{ marginBottom: "var(--s-5)" }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Look up a postcode
        </h2>
        <p className="card-sub">
          Type any postcode to see whether we have a centroid for it
          and how many listings reference it. Useful for verifying
          coverage before publishing in a new region.
        </p>
        <form
          method="get"
          action="/admin/postcodes"
          style={{
            display: "flex",
            gap: "var(--s-3)",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <Field label="Postcode" htmlFor="q">
            <Input
              id="q"
              name="q"
              type="text"
              inputMode="numeric"
              maxLength={8}
              placeholder="e.g. 2000"
              defaultValue={rawQuery}
              autoComplete="off"
              style={{ minWidth: 160 }}
            />
          </Field>
          <Button type="submit" variant="primary">
            Look up
          </Button>
          {rawQuery && (
            <Link
              href="/admin/postcodes"
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                textDecoration: "underline",
                marginLeft: 8,
              }}
            >
              Clear
            </Link>
          )}
        </form>

        {rawQuery && !lookup && (
          <p
            className="form-error"
            style={{ marginTop: "var(--s-4)", marginBottom: 0 }}
          >
            <strong>Invalid format.</strong>
            {" "}Postcodes should be 3–8 alphanumeric characters
            (e.g. 2000).
          </p>
        )}

        {lookup && (
          <div
            style={{
              marginTop: "var(--s-4)",
              padding: "var(--s-4) var(--s-5)",
              background: lookup.found ? "#ecfdf5" : "#fef3c7",
              border: `1px solid ${lookup.found ? "#a7f3d0" : "#fcd34d"}`,
              borderRadius: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "var(--s-3)",
                flexWrap: "wrap",
                marginBottom: "var(--s-3)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--ink-1)",
                  lineHeight: 1,
                }}
              >
                {lookup.postcode}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: lookup.found ? "#065f46" : "#78350f",
                  color: "#fff",
                }}
              >
                {lookup.found ? "Centroid on file" : "Not in table"}
              </span>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                columnGap: "var(--s-4)",
                rowGap: 6,
                margin: 0,
                fontSize: 14,
              }}
            >
              <LookupRow
                k="Place name"
                v={lookup.place_name ?? "—"}
                muted={!lookup.place_name}
              />
              <LookupRow
                k="Latitude"
                v={lookup.latitude != null ? lookup.latitude.toFixed(5) : "—"}
                muted={lookup.latitude == null}
                mono
              />
              <LookupRow
                k="Longitude"
                v={lookup.longitude != null ? lookup.longitude.toFixed(5) : "—"}
                muted={lookup.longitude == null}
                mono
              />
              <LookupRow
                k="Listings · total"
                v={lookup.listingTotal.toLocaleString()}
                mono
              />
              <LookupRow
                k="Listings · live"
                v={lookup.listingsLive.toLocaleString()}
                mono
              />
              <LookupRow
                k="Listings · sold"
                v={lookup.listingsSold.toLocaleString()}
                mono
              />
            </dl>

            {lookup.found && lookup.latitude != null && lookup.longitude != null && (
              <p
                style={{
                  margin: "var(--s-3) 0 0",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                <a
                  href={`https://www.openstreetmap.org/?mlat=${lookup.latitude}&mlon=${lookup.longitude}#map=14/${lookup.latitude}/${lookup.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--ink-2)",
                    textDecoration: "underline",
                  }}
                >
                  View centroid on OpenStreetMap →
                </a>
              </p>
            )}

            {!lookup.found && lookup.listingTotal > 0 && (
              <p
                style={{
                  margin: "var(--s-3) 0 0",
                  fontSize: 12,
                  color: "#78350f",
                  lineHeight: 1.5,
                }}
              >
                This postcode is in active use but missing from the
                centroid table — run the GeoNames import below to
                cover it.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Import GeoNames AU
        </h2>
        <p className="card-sub">
          Fetches{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              background: "var(--surface-sunken)",
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            download.geonames.org/export/zip/AU.zip
          </code>{" "}
          ({"~"}200KB), unzips, parses, and bulk-inserts every row.
          Idempotent — existing postcodes are skipped via{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            ON CONFLICT DO NOTHING
          </code>
          , so re-running is safe. Manual seed rows already in the table
          are preserved.
        </p>
        <p
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            marginTop: 0,
            lineHeight: 1.5,
          }}
        >
          Data licence: GeoNames Postal Codes are Creative Commons
          Attribution 4.0. Credit GeoNames in your site footer or
          credits page if you ship publicly.
        </p>
        <form action={importGeoNamesAUPostcodes}>
          <Button
            type="submit"
            variant="primary"
            title="Download, unzip and bulk-insert the GeoNames AU postal-code archive"
          >
            Run import now
          </Button>
        </form>
      </section>
    </div>
  );
}

function LookupRow({
  k,
  v,
  muted,
  mono,
}: {
  k: string;
  v: string;
  muted?: boolean;
  mono?: boolean;
}) {
  return (
    <>
      <dt
        style={{
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {k}
      </dt>
      <dd
        style={{
          margin: 0,
          color: muted ? "var(--ink-4)" : "var(--ink-1)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {v}
      </dd>
    </>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        padding: "var(--s-4)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "var(--ink-1)",
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 12,
            color: "var(--ink-4)",
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

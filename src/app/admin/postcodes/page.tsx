import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { importGeoNamesAUPostcodes } from "@/lib/actions/admin-postcodes";
import { Button } from "../../_components/ui";

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
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const summary = await loadSummary();

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

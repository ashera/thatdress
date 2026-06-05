import { requirePartner } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPartnerMarketingRegionIds } from "@/lib/regions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner dashboard" };

async function safeCount(sql: string, params: unknown[]): Promise<number> {
  try {
    const r = await query<{ count: string }>(sql, params);
    return Number(r.rows[0]?.count ?? 0);
  } catch (e) {
    console.error("[partner/dashboard] count failed", sql, e);
    return 0;
  }
}

function priceFormat(cents: number): string {
  if (cents >= 100_000_000) {
    return `$${(Math.round(cents / 10_000_000) / 10)
      .toString()
      .replace(/\.0$/, "")}M`;
  }
  if (cents >= 100_000) {
    return `$${(Math.round(cents / 10_000) / 10)
      .toString()
      .replace(/\.0$/, "")}k`;
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function numberFormat(n: number): string {
  return new Intl.NumberFormat("en-AU").format(n);
}

type RegionBreakdown = {
  region_id: string;
  label: string;
  active: string;
  sold: string;
  gmv: string;
};

async function fetchRegionBreakdown(
  regionIds: string[],
): Promise<RegionBreakdown[]> {
  try {
    const r = await query<RegionBreakdown>(
      `SELECT rg.id::text AS region_id,
              rg.label    AS label,
              COUNT(l.id) FILTER (
                WHERE l.is_published = TRUE
                  AND l.sold_at IS NULL
                  AND l.is_draft = FALSE
              )::text AS active,
              COUNT(l.id) FILTER (WHERE l.sold_at IS NOT NULL)::text AS sold,
              COALESCE(
                SUM(l.price_cents) FILTER (WHERE l.sold_at IS NOT NULL),
                0
              )::text AS gmv
         FROM regions rg
         LEFT JOIN listings l ON l.region_id = rg.id
        WHERE rg.id = ANY($1::bigint[])
        GROUP BY rg.id, rg.label, rg.sort_order
        ORDER BY rg.sort_order, rg.id`,
      [regionIds],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function PartnerDashboardPage() {
  const user = await requirePartner();
  const regionIds = await getPartnerMarketingRegionIds(user.id);

  if (regionIds.length === 0) {
    return (
      <div className="page admin-page" style={{ maxWidth: 1280 }}>
        <header className="admin-header" style={{ marginBottom: "var(--s-4)" }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Partner · Dashboard
          </p>
          <h1 style={{ marginBottom: 4 }}>Partner dashboard</h1>
        </header>
        <div className="empty-state">
          <h3>No marketing regions assigned yet</h3>
          <p style={{ margin: 0 }}>
            An admin needs to assign you one or more marketing regions
            before your dashboard can show activity.
          </p>
        </div>
      </div>
    );
  }

  const [
    breakdown,
    newListings7d,
    listingsUnderReview,
    activeSellers,
  ] = await Promise.all([
    fetchRegionBreakdown(regionIds),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM listings
        WHERE is_draft = FALSE
          AND created_at >= NOW() - INTERVAL '7 days'
          AND region_id = ANY($1::bigint[])`,
      [regionIds],
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM (
         SELECT 1 FROM listings l
          WHERE l.is_draft = FALSE
            AND l.region_id = ANY($1::bigint[])
            AND (
              l.trust_status = 'flagged'
              OR EXISTS (
                SELECT 1 FROM listing_flags f
                  WHERE f.listing_id = l.id AND f.resolved_at IS NULL
              )
            )
       ) x`,
      [regionIds],
    ),
    safeCount(
      `SELECT COUNT(DISTINCT seller_id)::text AS count FROM listings
        WHERE is_draft = FALSE
          AND is_published = TRUE
          AND sold_at IS NULL
          AND region_id = ANY($1::bigint[])`,
      [regionIds],
    ),
  ]);

  // Top-line totals are the sum of the per-region rows, so the tiles and
  // the breakdown table can never disagree.
  const totalActive = breakdown.reduce((s, r) => s + Number(r.active), 0);
  const totalSold = breakdown.reduce((s, r) => s + Number(r.sold), 0);
  const totalGmv = breakdown.reduce((s, r) => s + Number(r.gmv), 0);

  const regionNames = breakdown.map((r) => r.label).join(", ");

  const tiles: Tile[] = [
    {
      label: "Listings · active",
      value: numberFormat(totalActive),
      caption: "Published, not sold, in your regions",
      tone: "default",
    },
    {
      label: "Listings · sold",
      value: numberFormat(totalSold),
      caption: "All-time closed sales",
      tone: "default",
    },
    {
      label: "GMV (all-time)",
      value: priceFormat(totalGmv),
      caption: "Sum of sold-listing price",
      tone: "good",
    },
    {
      label: "Listings · new (7d)",
      value: numberFormat(newListings7d),
      caption: "Posted in the last 7 days",
      tone: "default",
    },
    {
      label: "Active sellers",
      value: numberFormat(activeSellers),
      caption: "With a live listing in your regions",
      tone: "default",
    },
    {
      label: "Listings under review",
      value: numberFormat(listingsUnderReview),
      caption: "Flagged or with open buyer reports",
      tone: listingsUnderReview > 0 ? "warn" : "default",
    },
  ];

  return (
    <div className="page admin-page" style={{ maxWidth: 1280 }}>
      <header className="admin-header" style={{ marginBottom: "var(--s-4)" }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Partner · Dashboard
        </p>
        <h1 style={{ marginBottom: 4 }}>Partner dashboard</h1>
        <p className="sub" style={{ margin: 0 }}>
          Marketplace activity across your marketing region
          {breakdown.length === 1 ? "" : "s"}: {regionNames}.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-3)",
          marginBottom: "var(--s-6)",
        }}
      >
        {tiles.map((t) => (
          <StatCard key={t.label} tile={t} />
        ))}
      </div>

      {breakdown.length > 1 && (
        <section
          className="form-card"
          style={{ padding: "var(--s-5)" }}
        >
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            By region
          </h2>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                <th style={thStyle("left")}>Region</th>
                <th style={thStyle("right")}>Active</th>
                <th style={thStyle("right")}>Sold</th>
                <th style={thStyle("right")}>GMV</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => (
                <tr
                  key={r.region_id}
                  style={{ borderTop: "1px solid var(--hairline)" }}
                >
                  <td style={tdStyle}>{r.label}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {numberFormat(Number(r.active))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {numberFormat(Number(r.sold))}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {priceFormat(Number(r.gmv))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function thStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: "8px 10px",
    textAlign: align,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
  };
}

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  color: "var(--ink-1)",
};

type Tile = {
  label: string;
  value: string;
  caption: string;
  tone: "default" | "good" | "warn";
};

function StatCard({ tile }: { tile: Tile }) {
  const palette =
    tile.tone === "warn"
      ? { bg: "#fef3c7", border: "#fcd34d", label: "#78350f", value: "#78350f" }
      : tile.tone === "good"
        ? {
            bg: "#ecfdf5",
            border: "#a7f3d0",
            label: "#065f46",
            value: "#065f46",
          }
        : {
            bg: "var(--surface)",
            border: "var(--hairline)",
            label: "var(--ink-4)",
            value: "var(--ink-1)",
          };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
        padding: "var(--s-4)",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        minHeight: 120,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: palette.label,
        }}
      >
        {tile.label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: palette.value,
          lineHeight: 1,
        }}
      >
        {tile.value}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
        {tile.caption}
      </div>
    </div>
  );
}

import { requirePartner } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  getCurrentTestRegion,
  getPartnerRegions,
  getSandboxRegionForUser,
} from "@/lib/regions";
import { updatePartnerListingFees } from "@/lib/actions/partner";
import { enterSandbox } from "@/lib/actions/regions";
import { bucketByPostcode, type MapListingRow } from "@/lib/listing-map";
import { Badge, Button, ButtonLink } from "../_components/ui";
import { ListingsMap } from "../_components/listings-map";

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

/** Human note about a region's free window / platform fee. */
function freePeriodNote(freeUntil: string | null, pct: number): string {
  if (!freeUntil) return "";
  const end = new Date(freeUntil);
  const date = end.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const now = Date.now();
  if (end.getTime() > now) {
    const days = Math.ceil((end.getTime() - now) / 86_400_000);
    return `Free until ${date} (${days} day${days === 1 ? "" : "s"} left), then a ${pct}% platform fee`;
  }
  return `Free period ended ${date} — ${pct}% platform fee applies`;
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

/** Live listings in the partner's region(s), for the dashboard map card. */
async function fetchRegionMapListings(
  regionIds: string[],
): Promise<MapListingRow[]> {
  try {
    const r = await query<MapListingRow>(
      `SELECT l.id::text, l.title, l.price_cents, l.location_postal,
              (SELECT li.id::text FROM listing_images li
                 WHERE li.listing_id = l.id
                 ORDER BY li.is_primary DESC, li.position, li.id
                 LIMIT 1) AS primary_image_id
         FROM listings l
        WHERE l.is_draft = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND l.region_id = ANY($1::bigint[])
        ORDER BY l.created_at DESC
        LIMIT 500`,
      [regionIds],
    );
    return r.rows;
  } catch {
    return [];
  }
}

function centsToInput(cents: number): string {
  if (!cents || cents <= 0) return "";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requirePartner();
  const sp = searchParams ? await searchParams : {};
  const feeError =
    sp.error === "invalid-fee"
      ? "Enter a valid amount (e.g. 5 or 12.50), or leave blank for free."
      : null;
  const partnerRegions = await getPartnerRegions(user.id);
  const [sandbox, currentTest] = await Promise.all([
    getSandboxRegionForUser(user.id),
    getCurrentTestRegion(),
  ]);
  const inSandbox = !!sandbox && currentTest?.id === sandbox.id;
  // A sandbox/test region only counts as one of "your regions" while you're
  // inside it — otherwise its seeded stock would leak into the real
  // dashboard + region-listings (and clicking through would 404).
  const regions = partnerRegions.filter(
    (r) => !r.isTest || r.id === currentTest?.id,
  );
  const regionIds = regions.map((r) => r.id);

  const sandboxCard = sandbox ? (
    <section
      className="form-card"
      style={{
        padding: "var(--s-4) var(--s-5)",
        marginBottom: "var(--s-5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--s-4)",
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
            marginBottom: 4,
          }}
        >
          <h2 className="card-heading" style={{ margin: 0 }}>
            Your sandbox
          </h2>
          <Badge variant="info">Test region</Badge>
        </div>
        <p className="card-sub" style={{ margin: 0 }}>
          A private region only you can see — switch in to browse, list, and
          try the partner tools end to end. {inSandbox ? "You're in it now." : ""}
        </p>
      </div>
      {inSandbox ? (
        <Badge variant="ok">Active now</Badge>
      ) : (
        <form action={enterSandbox}>
          <input type="hidden" name="region_id" value={sandbox.id} />
          <input type="hidden" name="next" value="/listings" />
          <Button type="submit" variant="primary" size="sm" iconRight="arrow">
            Enter sandbox
          </Button>
        </form>
      )}
    </section>
  ) : null;

  if (regionIds.length === 0) {
    return (
      <div className="page admin-page" style={{ maxWidth: 1280 }}>
        <header className="admin-header" style={{ marginBottom: "var(--s-4)" }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Partner · Dashboard
          </p>
          <h1 style={{ marginBottom: 4 }}>Partner dashboard</h1>
        </header>
        {sandboxCard}
        <div className="empty-state">
          <h3>No marketing regions assigned yet</h3>
          <p style={{ margin: 0 }}>
            {sandbox
              ? "Enter your sandbox above to trial the partner tools, or an admin can assign you a live region."
              : "An admin needs to assign you one or more marketing regions before your dashboard can show activity."}
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

  const mapData = await bucketByPostcode(await fetchRegionMapListings(regionIds));

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
        <div style={{ marginTop: "var(--s-3)" }}>
          <ButtonLink
            href="/partner/listings"
            variant="primary"
            size="sm"
            iconRight="arrow"
          >
            View all listings in your region
            {breakdown.length === 1 ? "" : "s"}
          </ButtonLink>
        </div>
      </header>

      {sandboxCard}

      {sp.saved && !feeError && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Listing fees saved.
        </p>
      )}
      {feeError && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {feeError}
        </p>
      )}

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

      {mapData.buckets.length > 0 && (
        <section
          className="form-card"
          style={{ padding: "var(--s-5)", marginBottom: "var(--s-6)" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--s-3)",
              flexWrap: "wrap",
              marginBottom: "var(--s-3)",
            }}
          >
            <div>
              <h2 className="card-heading" style={{ margin: 0 }}>
                Where your listings are
              </h2>
              <p className="card-sub" style={{ margin: "2px 0 0" }}>
                Live listings clustered by suburb.
              </p>
            </div>
            <ButtonLink
              href="/partner/listings?view=map"
              variant="ghost"
              size="sm"
              iconRight="arrow"
            >
              Full map
            </ButtonLink>
          </div>
          <ListingsMap
            buckets={mapData.buckets}
            offMapCount={mapData.offMapCount}
            height="360px"
            minHeight={320}
          />
        </section>
      )}

      <section
        className="form-card"
        style={{ padding: "var(--s-5)", marginBottom: "var(--s-6)" }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Listing fees
        </h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Set what sellers pay to list a dress in each of your regions.
          Leave blank (or 0) to keep a region free.
        </p>
        <form
          action={updatePartnerListingFees}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          {regions.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--s-4)",
                flexWrap: "wrap",
              }}
            >
              <label
                htmlFor={`fee_${r.id}`}
                style={{ fontWeight: 600, color: "var(--ink-1)" }}
              >
                {r.label}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: "var(--ink-3)",
                    fontWeight: 400,
                  }}
                >
                  currently{" "}
                  {r.listingFeeCents > 0
                    ? priceFormat(r.listingFeeCents)
                    : "Free"}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 400,
                    color: "var(--ink-3)",
                    marginTop: 2,
                  }}
                >
                  {freePeriodNote(r.freeUntil, r.platformFeePct)}
                </span>
              </label>
              <div
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ color: "var(--ink-3)" }}>$</span>
                <input
                  id={`fee_${r.id}`}
                  name={`fee_${r.id}`}
                  type="text"
                  inputMode="decimal"
                  pattern="^\d+(\.\d{1,2})?$"
                  className="input"
                  defaultValue={centsToInput(r.listingFeeCents)}
                  placeholder="0.00 (free)"
                  style={{ width: 150 }}
                />
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "var(--s-2)",
            }}
          >
            <Button type="submit" variant="primary" iconRight="check">
              Save listing fees
            </Button>
          </div>
        </form>
      </section>

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

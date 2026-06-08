import Link from "next/link";
import { requirePartner } from "@/lib/auth";
import { query } from "@/lib/db";
import { getCurrentTestRegion, getPartnerRegions } from "@/lib/regions";
import { ButtonLink } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Active sellers — Partner" };

type Row = {
  id: string;
  email: string | null;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  live: string;
  sold: string;
  total: string;
};

function fmtName(r: Row): string {
  const name = [r.first_name, r.surname].filter(Boolean).join(" ").trim();
  return name || r.email || `Seller #${r.id}`;
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--s-2) var(--s-3)",
  fontSize: 12,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  padding: "var(--s-2) var(--s-3)",
  fontSize: "var(--t-body-s)",
  borderBottom: "1px solid var(--hairline)",
  verticalAlign: "middle",
};

export default async function PartnerSellersPage() {
  const user = await requirePartner();
  // Same region scoping as the dashboard: a sandbox/test region only counts
  // while you're inside it.
  const [allRegions, currentTest] = await Promise.all([
    getPartnerRegions(user.id),
    getCurrentTestRegion(),
  ]);
  const regions = allRegions.filter(
    (r) => !r.isTest || r.id === currentTest?.id,
  );
  const regionIds = regions.map((r) => r.id);

  if (regionIds.length === 0) {
    return (
      <div className="page page--pad" style={{ maxWidth: 960 }}>
        <h1>Active sellers</h1>
        <p className="sub">
          You don&rsquo;t have any marketing regions assigned yet.
        </p>
        <ButtonLink href="/partner" variant="ghost" size="sm" icon="arrow">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  let rows: Row[] = [];
  try {
    const r = await query<Row>(
      // Sellers with at least one live listing — the same set the dashboard
      // "Active sellers" tile counts — ordered by live inventory.
      `SELECT u.id::text, u.email, u.first_name, u.surname, u.town,
              COUNT(*) FILTER (
                WHERE l.is_published = TRUE AND l.sold_at IS NULL
              )::text AS live,
              COUNT(*) FILTER (WHERE l.sold_at IS NOT NULL)::text AS sold,
              COUNT(*)::text AS total
         FROM listings l
         JOIN users u ON u.id = l.seller_id
        WHERE l.is_draft = FALSE
          AND l.region_id = ANY($1::bigint[])
        GROUP BY u.id, u.email, u.first_name, u.surname, u.town
       HAVING COUNT(*) FILTER (
                WHERE l.is_published = TRUE AND l.sold_at IS NULL
              ) > 0
        ORDER BY live DESC, sold DESC, u.id`,
      [regionIds],
    );
    rows = r.rows;
  } catch {
    rows = [];
  }

  const regionNames = regions.map((r) => r.label).join(", ");

  return (
    <div className="page page--pad" style={{ maxWidth: 960 }}>
      <header style={{ marginBottom: "var(--s-5)" }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Partner · Sellers
        </p>
        <h1 style={{ marginBottom: 4 }}>Active sellers</h1>
        <p className="sub" style={{ margin: 0 }}>
          Sellers with a live listing in your region
          {regions.length === 1 ? "" : "s"}: {regionNames}.
        </p>
        <div style={{ marginTop: "var(--s-3)" }}>
          <ButtonLink href="/partner" variant="ghost" size="sm" icon="arrow">
            Back to dashboard
          </ButtonLink>
        </div>
      </header>

      <section className="form-card">
        <p className="card-sub" style={{ margin: "0 0 var(--s-3)" }}>
          <strong>{rows.length}</strong> active seller
          {rows.length === 1 ? "" : "s"}.
        </p>
        {rows.length === 0 ? (
          <p className="card-sub">No active sellers in your regions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={cellHead}>Seller</th>
                  <th style={cellHead}>Town</th>
                  <th style={{ ...cellHead, textAlign: "right" }}>Live</th>
                  <th style={{ ...cellHead, textAlign: "right" }}>Sold</th>
                  <th style={{ ...cellHead, textAlign: "right" }}>Total</th>
                  <th style={cellHead}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                        {fmtName(row)}
                      </div>
                      {row.email && (
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                          {row.email}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cell, color: "var(--ink-3)" }}>
                      {row.town ?? "—"}
                    </td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.live}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.sold}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{row.total}</td>
                    <td style={{ ...cell, textAlign: "right" }}>
                      <Link
                        href={`/partner/listings?seller=${row.id}`}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink-1)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View listings →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

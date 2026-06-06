import Link from "next/link";
import { requirePartner } from "@/lib/auth";
import { query } from "@/lib/db";
import { getPartnerRegions } from "@/lib/regions";
import { Badge, Button, ButtonLink, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Region listings — Partner" };

const MAX_ROWS = 500;

type Row = {
  id: string;
  title: string | null;
  price_cents: number;
  created_at: string;
  sold_at: string | null;
  is_published: boolean;
  designer_name: string | null;
  model: string | null;
  condition_label: string | null;
  occasion_label: string | null;
  size_label: string | null;
  region_label: string | null;
  seller_email: string | null;
  primary_image_id: string | null;
};

type RefOption = { id: string; label: string };

const STATUSES = ["all", "live", "sold", "hidden"] as const;
const SORTS = ["newest", "price_desc", "price_asc"] as const;
type Status = (typeof STATUSES)[number];
type Sort = (typeof SORTS)[number];

const SORT_LABELS: Record<Sort, string> = {
  newest: "Newest first",
  price_desc: "Price: high to low",
  price_asc: "Price: low to high",
};

function fmtAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
const filterField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--ink-3)",
};

export default async function PartnerListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    region?: string;
    occasion?: string;
    condition?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const user = await requirePartner();
  const regions = await getPartnerRegions(user.id);
  const regionIds = regions.map((r) => r.id);
  const multiRegion = regions.length > 1;

  if (regionIds.length === 0) {
    return (
      <div className="page page--pad" style={{ maxWidth: 1280 }}>
        <h1>Region listings</h1>
        <p className="sub">
          You don&rsquo;t have any marketing regions assigned yet.
        </p>
        <ButtonLink href="/partner" variant="ghost" size="sm" icon="arrow">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  const sp = await searchParams;
  const status: Status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Status)
    : "all";
  const sort: Sort = (SORTS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as Sort)
    : "newest";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const regionFilter =
    sp.region && regionIds.includes(sp.region) ? sp.region : null;
  const occasionFilter = /^\d+$/.test(sp.occasion ?? "") ? sp.occasion! : null;
  const conditionFilter = /^\d+$/.test(sp.condition ?? "") ? sp.condition! : null;

  const filtersActive =
    status !== "all" ||
    sort !== "newest" ||
    !!q ||
    !!regionFilter ||
    !!occasionFilter ||
    !!conditionFilter;

  // Filter dropdown options (occasions / conditions present in this
  // partner's regions, so the menus only offer relevant values).
  const [occasions, conditions] = await Promise.all([
    query<RefOption>(
      `SELECT DISTINCT o.id::text, o.label
         FROM listings l JOIN occasions o ON o.id = l.occasion_id
        WHERE l.is_draft = FALSE AND l.region_id = ANY($1::bigint[])
        ORDER BY o.label`,
      [regionIds],
    ).then((r) => r.rows).catch((): RefOption[] => []),
    query<RefOption>(
      `SELECT DISTINCT cg.id::text, cg.label
         FROM listings l JOIN condition_grades cg ON cg.id = l.condition_id
        WHERE l.is_draft = FALSE AND l.region_id = ANY($1::bigint[])
        ORDER BY cg.sort_order`,
      [regionIds],
    ).then((r) => r.rows).catch((): RefOption[] => []),
  ]);

  // Build the filtered query.
  const conds: string[] = ["l.is_draft = FALSE"];
  const params: unknown[] = [];
  let p = 0;
  params.push(regionIds);
  conds.push(`l.region_id = ANY($${++p}::bigint[])`);
  if (regionFilter) {
    params.push(regionFilter);
    conds.push(`l.region_id = $${++p}::bigint`);
  }
  if (status === "live") conds.push("l.is_published = TRUE AND l.sold_at IS NULL");
  else if (status === "sold") conds.push("l.sold_at IS NOT NULL");
  else if (status === "hidden")
    conds.push("l.is_published = FALSE AND l.sold_at IS NULL");
  if (occasionFilter) {
    params.push(occasionFilter);
    conds.push(`l.occasion_id = $${++p}::bigint`);
  }
  if (conditionFilter) {
    params.push(conditionFilter);
    conds.push(`l.condition_id = $${++p}::bigint`);
  }
  if (q) {
    params.push(`%${q}%`);
    const n = ++p;
    conds.push(
      `(d.name ILIKE $${n} OR dr.model ILIKE $${n} OR l.title ILIKE $${n} OR u.email ILIKE $${n})`,
    );
  }
  const orderBy =
    sort === "price_asc"
      ? "l.price_cents ASC, l.created_at DESC"
      : sort === "price_desc"
        ? "l.price_cents DESC, l.created_at DESC"
        : "l.created_at DESC";

  let rows: Row[] = [];
  try {
    const r = await query<Row>(
      `SELECT l.id::text, l.title, l.price_cents, l.created_at::text,
              l.sold_at::text, l.is_published,
              d.name AS designer_name, dr.model AS model,
              cg.label AS condition_label, o.label AS occasion_label,
              ds.label AS size_label, rg.label AS region_label,
              u.email AS seller_email,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id
         FROM listings l
         JOIN dresses dr        ON dr.id = l.dress_id
         LEFT JOIN designers        d  ON d.id  = dr.designer_id
         LEFT JOIN condition_grades cg ON cg.id = l.condition_id
         LEFT JOIN occasions        o  ON o.id  = l.occasion_id
         LEFT JOIN dress_sizes      ds ON ds.id = dr.size_id
         LEFT JOIN regions          rg ON rg.id = l.region_id
         LEFT JOIN users            u  ON u.id  = l.seller_id
        WHERE ${conds.join(" AND ")}
        ORDER BY ${orderBy}
        LIMIT ${MAX_ROWS}`,
      params,
    );
    rows = r.rows;
  } catch {
    rows = [];
  }

  const regionNames = regions.map((r) => r.label).join(", ");

  return (
    <div className="page page--pad" style={{ maxWidth: 1280 }}>
      <header style={{ marginBottom: "var(--s-5)" }}>
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Partner · Listings
        </p>
        <h1 style={{ marginBottom: 4 }}>Region listings</h1>
        <p className="sub" style={{ margin: 0 }}>
          Listings in your region{regions.length === 1 ? "" : "s"}: {regionNames}.
        </p>
        <div style={{ marginTop: "var(--s-3)" }}>
          <ButtonLink href="/partner" variant="ghost" size="sm" icon="arrow">
            Back to dashboard
          </ButtonLink>
        </div>
      </header>

      {/* Filter bar */}
      <form
        method="get"
        className="form-card"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--s-3)",
          alignItems: "flex-end",
          marginBottom: "var(--s-5)",
          padding: "var(--s-4)",
        }}
      >
        <label style={{ ...filterField, flex: "2 1 200px" }}>
          Search
          <Input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Designer, name, or seller email"
          />
        </label>

        <label style={filterField}>
          Status
          <select name="status" defaultValue={status} className="input">
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="sold">Sold</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>

        {multiRegion && (
          <label style={filterField}>
            Region
            <select name="region" defaultValue={regionFilter ?? ""} className="input">
              <option value="">All regions</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={filterField}>
          Occasion
          <select name="occasion" defaultValue={occasionFilter ?? ""} className="input">
            <option value="">All</option>
            {occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={filterField}>
          Condition
          <select name="condition" defaultValue={conditionFilter ?? ""} className="input">
            <option value="">All</option>
            {conditions.map((cnd) => (
              <option key={cnd.id} value={cnd.id}>
                {cnd.label}
              </option>
            ))}
          </select>
        </label>

        <label style={filterField}>
          Sort
          <select name="sort" defaultValue={sort} className="input">
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" variant="primary" size="sm">
          Filter
        </Button>
        {filtersActive && (
          <Link
            href="/partner/listings"
            style={{
              fontSize: "var(--t-body-s)",
              color: "var(--ink-3)",
              alignSelf: "center",
            }}
          >
            Clear
          </Link>
        )}
      </form>

      <section className="form-card">
        <p className="card-sub" style={{ marginTop: 0 }}>
          <strong>{rows.length}</strong> listing{rows.length === 1 ? "" : "s"}
          {rows.length >= MAX_ROWS ? ` (showing newest ${MAX_ROWS})` : ""}.
        </p>
        {rows.length === 0 ? (
          <p className="card-sub">No listings match these filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={cellHead}></th>
                  <th style={cellHead}>Listing</th>
                  <th style={cellHead}>Price</th>
                  <th style={cellHead}>Condition</th>
                  <th style={cellHead}>Occasion</th>
                  <th style={cellHead}>Size</th>
                  {multiRegion && <th style={cellHead}>Region</th>}
                  <th style={cellHead}>Seller</th>
                  <th style={cellHead}>Status</th>
                  <th style={cellHead}>Listed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const st = row.sold_at
                    ? { variant: "ink" as const, label: "Sold" }
                    : !row.is_published
                      ? { variant: "warn" as const, label: "Hidden" }
                      : { variant: "ok" as const, label: "Live" };
                  const name =
                    [row.designer_name, row.model].filter(Boolean).join(" ") ||
                    row.title ||
                    `Listing #${row.id}`;
                  return (
                    <tr key={row.id}>
                      <td style={cell}>
                        {row.primary_image_id ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/listings/${row.id}/images/${row.primary_image_id}`}
                            alt=""
                            width={40}
                            height={52}
                            style={{
                              width: 40,
                              height: 52,
                              objectFit: "cover",
                              borderRadius: 4,
                              display: "block",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 52,
                              borderRadius: 4,
                              background: "var(--surface-sunken)",
                            }}
                          />
                        )}
                      </td>
                      <td style={cell}>
                        <Link
                          href={`/listings/${row.id}`}
                          style={{ color: "var(--ink-1)", fontWeight: 600 }}
                        >
                          {name}
                        </Link>
                      </td>
                      <td style={cell}>{fmtAud(row.price_cents)}</td>
                      <td style={cell}>{row.condition_label ?? "—"}</td>
                      <td style={cell}>{row.occasion_label ?? "—"}</td>
                      <td style={cell}>{row.size_label ?? "—"}</td>
                      {multiRegion && (
                        <td style={cell}>{row.region_label ?? "—"}</td>
                      )}
                      <td style={{ ...cell, color: "var(--ink-3)" }}>
                        {row.seller_email ?? "—"}
                      </td>
                      <td style={cell}>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {fmtDate(row.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

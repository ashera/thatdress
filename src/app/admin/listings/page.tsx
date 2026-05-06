import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "All listings — Admin" };

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first", sql: "l.created_at DESC" },
  { value: "oldest", label: "Oldest first", sql: "l.created_at ASC" },
  {
    value: "active",
    label: "Most recent conversation",
    sql: "last_message_at DESC NULLS LAST, l.created_at DESC",
  },
  {
    value: "msgs",
    label: "Most conversations",
    sql: "conversation_count DESC, l.created_at DESC",
  },
  { value: "price-high", label: "Price (high → low)", sql: "l.price_cents DESC" },
  { value: "price-low", label: "Price (low → high)", sql: "l.price_cents ASC" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const STATUS_OPTIONS = [
  { value: "convs", label: "With conversations (not sold)" },
  { value: "active", label: "Active (live)" },
  { value: "all", label: "All (incl. hidden + sold)" },
  { value: "sold", label: "Sold" },
  { value: "hidden", label: "Hidden" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

type Row = {
  id: string;
  title: string;
  price_cents: number;
  is_published: boolean;
  sold_at: string | null;
  created_at: string;
  trust_status: string | null;
  designer_name: string | null;
  seller_email: string | null;
  primary_image_id: string | null;
  conversation_count: string;
  recent_message_count: string;
  last_message_at: string | null;
};

async function fetchListings(opts: {
  search: string;
  sort: SortValue;
  status: StatusValue;
}): Promise<Row[]> {
  const { search, sort, status } = opts;
  const sortSql =
    SORT_OPTIONS.find((o) => o.value === sort)?.sql ?? SORT_OPTIONS[0].sql;

  const params: unknown[] = [];
  const where: string[] = ["l.is_draft = FALSE"];

  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    const i = `$${params.length}`;
    where.push(
      `(l.title ILIKE ${i} OR d.name ILIKE ${i} OR u.email ILIKE ${i})`,
    );
  }
  if (status === "active") {
    where.push("l.is_published = TRUE", "l.sold_at IS NULL");
  } else if (status === "sold") {
    where.push("l.sold_at IS NOT NULL");
  } else if (status === "hidden") {
    where.push("l.is_published = FALSE");
  } else if (status === "convs") {
    where.push(
      "EXISTS (SELECT 1 FROM conversations WHERE listing_id = l.id)",
      "l.sold_at IS NULL",
    );
  }
  // 'all' adds nothing.

  try {
    const r = await query<Row>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.is_published,
              l.sold_at::text,
              l.created_at::text,
              l.trust_status,
              d.name  AS designer_name,
              u.email AS seller_email,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              (
                SELECT COUNT(*)::text FROM conversations
                  WHERE listing_id = l.id
              ) AS conversation_count,
              (
                SELECT COUNT(*)::text
                  FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                  WHERE c.listing_id = l.id
                    AND m.created_at > NOW() - INTERVAL '7 days'
              ) AS recent_message_count,
              (
                SELECT MAX(m.created_at)::text
                  FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                  WHERE c.listing_id = l.id
              ) AS last_message_at
         FROM listings l
         LEFT JOIN designers d ON d.id = l.designer_id
         LEFT JOIN users     u ON u.id = l.seller_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${sortSql}
        LIMIT 200`,
      params,
    );
    return r.rows;
  } catch {
    return [];
  }
}

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function timeSince(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function StatusPill({
  children,
  color,
  textColor,
}: {
  children: string;
  color: string;
  textColor?: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        background: color,
        color: textColor ?? "var(--ink-1)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; status?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const search = (sp.q ?? "").slice(0, 200);
  const sort: SortValue =
    (SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as SortValue) ??
    "active";
  const status: StatusValue =
    (STATUS_OPTIONS.find((o) => o.value === sp.status)?.value as StatusValue) ??
    "convs";

  const rows = await fetchListings({ search, sort, status });

  return (
    <div className="page admin-page" style={{ maxWidth: 1280 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Listings</p>
        <h1>All listings</h1>
        <p className="sub">
          {rows.length} of up to 200 shown. Click any card to open the
          listing — buyer conversations and offers appear inline on the
          detail page for admins.
        </p>
      </header>

      <form
        method="get"
        action="/admin/listings"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: "var(--s-5)",
          padding: "var(--s-4)",
          background: "var(--surface-sunken)",
          borderRadius: 12,
          border: "1px solid var(--hairline)",
        }}
      >
        <label style={{ flex: "2 1 240px" }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 4,
            }}
          >
            Search
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Title, designer, seller email…"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              fontSize: 14,
              boxSizing: "border-box",
              background: "var(--surface)",
              color: "var(--ink-1)",
            }}
          />
        </label>
        <label style={{ flex: "1 1 180px" }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 4,
            }}
          >
            Sort
          </span>
          <select
            name="sort"
            defaultValue={sort}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              fontSize: 14,
              background: "var(--surface)",
              color: "var(--ink-1)",
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 180px" }}>
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: 4,
            }}
          >
            Filter
          </span>
          <select
            name="status"
            defaultValue={status}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--hairline)",
              fontSize: 14,
              background: "var(--surface)",
              color: "var(--ink-1)",
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            background: "var(--ink-1)",
            color: "#fff",
            border: 0,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
        {(search || sort !== "active" || status !== "convs") && (
          <Link
            href="/admin/listings"
            style={{
              alignSelf: "center",
              fontSize: 13,
              color: "var(--ink-3)",
              textDecoration: "underline",
            }}
          >
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No listings match</h3>
          <p style={{ margin: 0 }}>
            Try a different search term or change the filter.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: 12,
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <table
            className="admin-listings-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead
              style={{
                background: "var(--surface-sunken)",
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <tr>
                <th style={thStyle("48px")}></th>
                <th style={thStyle("auto", "left")}>Listing</th>
                <th style={thStyle("220px", "left")}>Seller</th>
                <th style={thStyle("100px", "right")}>Price</th>
                <th style={thStyle("160px", "left")}>Status</th>
                <th
                  style={thStyle("70px", "right")}
                  title="Conversations"
                >
                  💬
                </th>
                <th style={thStyle("130px", "left")}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const convCount = Number(row.conversation_count ?? 0);
                const recentCount = Number(row.recent_message_count ?? 0);
                const lastSeen = timeSince(row.last_message_at);
                const isSold = !!row.sold_at;
                const isHidden = !row.is_published;
                const isFlagged = row.trust_status === "flagged";
                const isVerified = row.trust_status === "verified";
                const isAuthenticated = row.trust_status === "authenticated";
                const detailHref = `/listings/${row.id}`;
                return (
                  <tr
                    key={row.id}
                    className="admin-listings-row"
                    style={{
                      borderBottom:
                        i === rows.length - 1
                          ? "none"
                          : "1px solid var(--hairline)",
                      background: i % 2 === 0 ? "var(--surface)" : "var(--surface-sunken-soft, var(--surface))",
                    }}
                  >
                    <td style={{ ...tdStyle, width: 48 }}>
                      <Link
                        href={detailHref}
                        style={{ display: "block" }}
                        aria-label={`Open ${row.title}`}
                      >
                        <span
                          style={{
                            display: "block",
                            width: 36,
                            aspectRatio: "3 / 4",
                            borderRadius: 4,
                            overflow: "hidden",
                            background: "var(--surface-sunken)",
                            position: "relative",
                          }}
                        >
                          {row.primary_image_id && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/listings/${row.id}/images/${row.primary_image_id}`}
                              alt=""
                              loading="lazy"
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          )}
                        </span>
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      <Link
                        href={detailHref}
                        style={{
                          color: "var(--ink-1)",
                          textDecoration: "none",
                          fontWeight: 600,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.title}
                      </Link>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--ink-3)",
                          marginTop: 2,
                        }}
                      >
                        {row.designer_name ?? "—"}
                      </div>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: 12,
                        color: "var(--ink-2)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                      }}
                    >
                      {row.seller_email ?? (
                        <span style={{ color: "var(--ink-4)" }}>(none)</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {priceLabel(row.price_cents)}
                    </td>
                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        {isSold && (
                          <StatusPill color="#1c1816" textColor="#fff">
                            Sold
                          </StatusPill>
                        )}
                        {isHidden && (
                          <StatusPill color="#f3e8ff">Hidden</StatusPill>
                        )}
                        {isFlagged && (
                          <StatusPill color="#fee2e2">Flagged</StatusPill>
                        )}
                        {isVerified && (
                          <StatusPill color="#fef3c7">Verified</StatusPill>
                        )}
                        {isAuthenticated && (
                          <StatusPill color="#1c1816" textColor="#fff">
                            Authenticated
                          </StatusPill>
                        )}
                        {!isSold &&
                          !isHidden &&
                          !isFlagged &&
                          !isVerified &&
                          !isAuthenticated && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--ink-4)",
                              }}
                            >
                              —
                            </span>
                          )}
                      </div>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: convCount > 0 ? 600 : 400,
                        color:
                          convCount > 0 ? "var(--ink-1)" : "var(--ink-4)",
                      }}
                    >
                      {convCount}
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12 }}>
                      {lastSeen ? (
                        <span style={{ color: "var(--ink-2)" }}>
                          {recentCount > 0 && !isSold && (
                            <span
                              title={`${recentCount} message${recentCount === 1 ? "" : "s"} in the last 7 days`}
                              style={{
                                color: "#16a34a",
                                marginRight: 4,
                              }}
                            >
                              ●
                            </span>
                          )}
                          {lastSeen}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function thStyle(
  width: string,
  align: "left" | "right" | "center" = "center",
): React.CSSProperties {
  return {
    width,
    padding: "10px 12px",
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
  padding: "10px 12px",
  verticalAlign: "middle",
};

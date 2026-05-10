import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  resolveReviewFlag,
  setReviewHidden,
} from "@/lib/actions/admin-reviews";
import { Button } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews — Admin" };

const FILTER_OPTIONS = [
  { value: "flagged", label: "Flagged (sellers disputing)" },
  { value: "hidden", label: "Hidden by admin" },
  { value: "live", label: "Live (visible on profiles)" },
  { value: "all", label: "All" },
] as const;

type FilterValue = (typeof FILTER_OPTIONS)[number]["value"];

const ACTION_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  hidden: { ok: true, text: "Review hidden from the seller's profile." },
  unhidden: { ok: true, text: "Review restored to the seller's profile." },
  "flag-resolved": {
    ok: true,
    text: "Flag cleared. The review stays live on the seller's profile.",
  },
};

type Row = {
  id: string;
  listing_id: string;
  listing_title: string;
  seller_id: string;
  seller_email: string;
  buyer_id: string;
  buyer_email: string;
  stars: number;
  body: string | null;
  as_described: boolean | null;
  easy_communication: boolean | null;
  smooth_handover: boolean | null;
  created_at: string;
  edited_at: string | null;
  hidden_by_admin_at: string | null;
  flagged_at: string | null;
  flag_reason: string | null;
};

async function fetchReviews(filter: FilterValue): Promise<Row[]> {
  const where: string[] = [];
  if (filter === "flagged") where.push("r.flagged_at IS NOT NULL");
  else if (filter === "hidden")
    where.push("r.hidden_by_admin_at IS NOT NULL");
  else if (filter === "live")
    where.push(
      "r.flagged_at IS NULL",
      "r.hidden_by_admin_at IS NULL",
    );
  // 'all' adds no filter.

  const sql = `
    SELECT r.id::text,
           r.listing_id::text,
           l.title                  AS listing_title,
           r.seller_id::text,
           su.email                 AS seller_email,
           r.buyer_id::text,
           bu.email                 AS buyer_email,
           r.stars,
           r.body,
           r.as_described,
           r.easy_communication,
           r.smooth_handover,
           r.created_at::text,
           r.edited_at::text,
           r.hidden_by_admin_at::text,
           r.flagged_at::text,
           r.flag_reason
      FROM listing_reviews r
      LEFT JOIN listings l  ON l.id  = r.listing_id
      LEFT JOIN users    su ON su.id = r.seller_id
      LEFT JOIN users    bu ON bu.id = r.buyer_id
     ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY
       (r.flagged_at IS NOT NULL) DESC,
       r.created_at DESC
     LIMIT 200`;
  try {
    const r = await query<Row>(sql);
    return r.rows;
  } catch {
    return [];
  }
}

function formatDateTime(s: string): string {
  try {
    return new Date(s).toLocaleString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function chipsFor(row: Row): string[] {
  const out: string[] = [];
  if (row.as_described === true) out.push("As described");
  if (row.as_described === false) out.push("Not as described");
  if (row.easy_communication === true) out.push("Easy comms");
  if (row.easy_communication === false) out.push("Hard to reach");
  if (row.smooth_handover === true) out.push("Smooth handover");
  if (row.smooth_handover === false) out.push("Bumpy handover");
  return out;
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; action?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filter: FilterValue =
    (FILTER_OPTIONS.find((o) => o.value === sp.filter)?.value as FilterValue) ??
    "flagged";
  const actionMessage = sp.action
    ? ACTION_MESSAGES[sp.action] ?? null
    : null;

  const rows = await fetchReviews(filter);

  return (
    <div className="page admin-page" style={{ maxWidth: 1024 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Reviews</p>
        <h1>Seller reviews</h1>
        <p className="sub">
          Moderate buyer-submitted reviews. Hide takes a review off the
          seller&rsquo;s public profile (the row stays for audit).
          Resolve clears a seller&rsquo;s flag without changing the
          review&rsquo;s visibility.
        </p>
      </header>

      {actionMessage && (
        <p
          className={actionMessage.ok ? "form-success" : "form-error"}
          style={{ marginBottom: "var(--s-5)" }}
        >
          {actionMessage.text}
        </p>
      )}

      <form
        method="get"
        action="/admin/reviews"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          marginBottom: "var(--s-5)",
          padding: "var(--s-4)",
          background: "var(--surface-sunken)",
          borderRadius: 12,
          border: "1px solid var(--hairline)",
          flexWrap: "wrap",
        }}
      >
        <label style={{ flex: "1 1 240px" }}>
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
            name="filter"
            defaultValue={filter}
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
            {FILTER_OPTIONS.map((o) => (
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
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing matches</h3>
          <p style={{ margin: 0 }}>
            No reviews in this state right now.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          {rows.map((row) => {
            const isHidden = !!row.hidden_by_admin_at;
            const isFlagged = !!row.flagged_at;
            const chips = chipsFor(row);
            return (
              <li
                key={row.id}
                style={{
                  padding: "var(--s-4) var(--s-5)",
                  background: "var(--surface)",
                  border: `1px solid ${
                    isFlagged ? "#fee2e2" : "var(--hairline)"
                  }`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      color: "#fcd34d",
                      fontSize: 18,
                      lineHeight: 1,
                    }}
                  >
                    {"★".repeat(row.stars)}
                    <span style={{ color: "var(--hairline)" }}>
                      {"★".repeat(5 - row.stars)}
                    </span>
                  </span>
                  {isFlagged && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "#fee2e2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      Flagged
                    </span>
                  )}
                  {isHidden && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--ink-1)",
                        color: "#fff",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      Hidden
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ink-3)",
                      marginLeft: "auto",
                    }}
                  >
                    {formatDateTime(row.created_at)}
                    {row.edited_at && (
                      <> · edited {formatDateTime(row.edited_at)}</>
                    )}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-2)",
                    marginBottom: 6,
                  }}
                >
                  <strong style={{ color: "var(--ink-1)" }}>
                    {row.buyer_email}
                  </strong>{" "}
                  bought{" "}
                  <Link
                    href={`/listings/${row.listing_id}`}
                    style={{
                      color: "var(--ink-1)",
                      textDecoration: "underline",
                      textDecorationColor: "var(--hairline-strong)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {row.listing_title}
                  </Link>{" "}
                  from{" "}
                  <Link
                    href={`/sellers/${row.seller_id}`}
                    style={{
                      color: "var(--ink-1)",
                      textDecoration: "underline",
                      textDecorationColor: "var(--hairline-strong)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {row.seller_email}
                  </Link>
                </div>

                {row.body && (
                  <p
                    style={{
                      margin: "8px 0",
                      color: "var(--ink-1)",
                      lineHeight: 1.5,
                      fontSize: 14,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {row.body}
                  </p>
                )}

                {chips.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      flexWrap: "wrap",
                      marginTop: 8,
                    }}
                  >
                    {chips.map((c) => (
                      <span
                        key={c}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--surface-sunken)",
                          border: "1px solid var(--hairline)",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.06em",
                          color: "var(--ink-2)",
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {row.flag_reason && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      background: "#fef3c7",
                      border: "1px solid #fcd34d",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#92400e",
                    }}
                  >
                    <strong>Seller&rsquo;s flag:</strong>{" "}
                    {row.flag_reason}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 12,
                  }}
                >
                  <form action={setReviewHidden}>
                    <input type="hidden" name="reviewId" value={row.id} />
                    <input
                      type="hidden"
                      name="mode"
                      value={isHidden ? "unhide" : "hide"}
                    />
                    <Button
                      type="submit"
                      variant={isHidden ? "primary" : "dark"}
                      size="sm"
                    >
                      {isHidden ? "Unhide" : "Hide from profile"}
                    </Button>
                  </form>
                  {isFlagged && (
                    <form action={resolveReviewFlag}>
                      <input type="hidden" name="reviewId" value={row.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Resolve flag (keep review)
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

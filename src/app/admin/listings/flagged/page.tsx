import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { setListingTrustStatus } from "@/lib/actions/listing-trust";
import { Button } from "../../../_components/ui";

export const dynamic = "force-dynamic";

type Report = {
  reason: string;
  created_at: string;
  by_email: string | null;
  by_is_admin: boolean | null;
};

type FlaggedRow = {
  id: string;
  title: string;
  price_cents: number;
  seller_email: string | null;
  seller_id: string | null;
  is_published: boolean;
  sold_at: string | null;
  created_at: string;
  designer_name: string | null;
  primary_image_id: string | null;
  trust_status: string | null;
  // All currently-open reports against this listing, newest first.
  // Empty array when the listing is admin-flagged but has no open
  // buyer reports.
  reports: Report[] | null;
};

async function fetchFlagged(): Promise<FlaggedRow[]> {
  try {
    const r = await query<FlaggedRow>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.is_published,
              l.sold_at::text,
              l.created_at::text,
              l.trust_status,
              u.email AS seller_email,
              l.seller_id::text,
              d.name  AS designer_name,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              (
                SELECT json_agg(
                  json_build_object(
                    'reason',      lf.reason,
                    'created_at',  lf.created_at::text,
                    'by_email',    fbu.email,
                    'by_is_admin', fbu.is_admin
                  )
                  ORDER BY lf.created_at DESC
                )
                FROM listing_flags lf
                LEFT JOIN users fbu ON fbu.id = lf.flagged_by_user_id
                WHERE lf.listing_id  = l.id
                  AND lf.resolved_at IS NULL
              ) AS reports
         FROM listings l
         LEFT JOIN users     u ON u.id = l.seller_id
         JOIN dresses dr     ON dr.id = l.dress_id
         LEFT JOIN designers d ON d.id = dr.designer_id
        WHERE (
          l.trust_status = 'flagged'
          OR EXISTS (
            SELECT 1 FROM listing_flags lf2
              WHERE lf2.listing_id = l.id
                AND lf2.resolved_at IS NULL
          )
        )
          AND l.is_draft = FALSE
        ORDER BY COALESCE(
          (SELECT MAX(created_at) FROM listing_flags
             WHERE listing_id = l.id AND resolved_at IS NULL),
          l.created_at
        ) DESC
        LIMIT 200`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

function formatFlagDateTime(s: string): string {
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

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export default async function FlaggedListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await fetchFlagged();

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Listings · Reports</p>
        <h1>Listings under review</h1>
        <p className="sub">
          Listings admins have flagged plus open buyer reports.
          Click into one to read the report, see the listing, and
          decide. <strong>Dismiss reports</strong> closes open
          reports without changing trust state;{" "}
          <strong>Restore</strong> (visible only on currently-flagged
          listings) un-flags and closes reports together.
        </p>
      </header>

      {sp.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing under review</h3>
          <p style={{ margin: 0 }}>
            No admin-flagged listings and no open buyer reports right
            now.
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
          {rows.map((row) => (
            <li
              key={row.id}
              className="form-card"
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr auto",
                gap: "var(--s-4)",
                alignItems: "center",
                padding: "var(--s-4)",
              }}
            >
              <div
                style={{
                  width: 80,
                  aspectRatio: "3 / 4",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "var(--surface-sunken)",
                  position: "relative",
                }}
              >
                {row.primary_image_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/listings/${row.id}/images/${row.primary_image_id}?w=200`}
                    alt=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        row.trust_status === "flagged"
                          ? "#fee2e2"
                          : "#fef3c7",
                      color:
                        row.trust_status === "flagged"
                          ? "#991b1b"
                          : "#92400e",
                    }}
                  >
                    {row.trust_status === "flagged"
                      ? "Flagged"
                      : "Pending review"}
                  </span>
                </div>
                <Link
                  href={`/listings/${row.id}`}
                  style={{
                    fontWeight: 700,
                    color: "var(--ink-1)",
                    textDecoration: "none",
                    display: "block",
                  }}
                >
                  {row.title}
                </Link>
                <div
                  style={{
                    fontSize: "var(--t-body-s)",
                    color: "var(--ink-3)",
                    marginTop: 2,
                  }}
                >
                  {[
                    row.designer_name,
                    priceLabel(row.price_cents),
                    formatDate(row.created_at),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ink-4)",
                    marginTop: 2,
                  }}
                >
                  Seller: {row.seller_email ?? "(unknown)"}
                  {row.is_published ? "" : " · Hidden"}
                  {row.sold_at ? " · Sold" : ""}
                </div>
                {row.reports && row.reports.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {row.reports.length > 1 && (
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--ink-3)",
                        }}
                      >
                        {row.reports.length} open reports
                      </div>
                    )}
                    {row.reports.map((rep, ri) => (
                      <div
                        key={ri}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "var(--surface-sunken)",
                          borderLeft: `3px solid ${rep.by_is_admin ? "#92400e" : "var(--ink-2)"}`,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            color: "var(--ink-3)",
                            marginBottom: 4,
                          }}
                        >
                          Reported by {rep.by_email ?? "(unknown)"}
                          {rep.by_is_admin ? " (admin)" : " (buyer)"}
                          {rep.created_at
                            ? ` · ${formatFlagDateTime(rep.created_at)}`
                            : ""}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--ink-1)",
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {rep.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <form action={setListingTrustStatus}>
                  <input type="hidden" name="listingId" value={row.id} />
                  <input type="hidden" name="status" value="self-declared" />
                  <input type="hidden" name="next" value="queue" />
                  <Button type="submit" variant="primary" size="sm">
                    {row.trust_status === "flagged"
                      ? "Restore"
                      : "Dismiss reports"}
                  </Button>
                </form>
                <Link
                  href={`/listings/${row.id}`}
                  style={{
                    fontSize: "var(--t-body-s)",
                    color: "var(--ink-2)",
                    fontWeight: 600,
                    alignSelf: "center",
                    textDecoration: "underline",
                  }}
                >
                  Open listing
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

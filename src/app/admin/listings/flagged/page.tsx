import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { setListingTrustStatus } from "@/lib/actions/listing-trust";
import { Button } from "../../../_components/ui";

export const dynamic = "force-dynamic";

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
  flag_reason: string | null;
  flag_created_at: string | null;
  flag_by_email: string | null;
  flag_count: string | null;
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
              u.email AS seller_email,
              l.seller_id::text,
              d.name  AS designer_name,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              fl.reason         AS flag_reason,
              fl.created_at::text AS flag_created_at,
              fbu.email         AS flag_by_email,
              (
                SELECT COUNT(*)::text FROM listing_flags
                  WHERE listing_id = l.id
              )                 AS flag_count
         FROM listings l
         LEFT JOIN users     u ON u.id = l.seller_id
         LEFT JOIN designers d ON d.id = l.designer_id
         LEFT JOIN LATERAL (
           SELECT lf.reason, lf.created_at, lf.flagged_by_user_id
             FROM listing_flags lf
            WHERE lf.listing_id = l.id
              AND lf.resolved_at IS NULL
            ORDER BY lf.created_at DESC
            LIMIT 1
         ) fl ON TRUE
         LEFT JOIN users     fbu ON fbu.id = fl.flagged_by_user_id
        WHERE l.trust_status = 'flagged'
          AND l.is_draft = FALSE
        ORDER BY COALESCE(fl.created_at, l.created_at) DESC
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
        <p className="eyebrow">Admin · Listings · Flagged</p>
        <h1>Flagged listings</h1>
        <p className="sub">
          Listings flagged for review. Restore (un-flag) when the
          report turns out to be false; otherwise leave flagged and
          consider hiding the listing on its detail page.
        </p>
      </header>

      {sp.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing flagged</h3>
          <p style={{ margin: 0 }}>
            Flag a listing from its detail page (admin actions section)
            to send it here for review.
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
                    src={`/api/listings/${row.id}/images/${row.primary_image_id}`}
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
                {row.flag_reason && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--surface-sunken)",
                      borderLeft: "3px solid var(--ink-2)",
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
                      Flagged by {row.flag_by_email ?? "(unknown)"}{" "}
                      {row.flag_created_at
                        ? `· ${formatFlagDateTime(row.flag_created_at)}`
                        : ""}
                      {row.flag_count && Number(row.flag_count) > 1
                        ? ` · ${row.flag_count} total flags`
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
                      {row.flag_reason}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <form action={setListingTrustStatus}>
                  <input type="hidden" name="listingId" value={row.id} />
                  <input type="hidden" name="status" value="self-declared" />
                  <input type="hidden" name="next" value="queue" />
                  <Button type="submit" variant="primary" size="sm">
                    Restore
                  </Button>
                </form>
                <Link
                  href={`/listings/${row.id}/edit`}
                  style={{
                    fontSize: "var(--t-body-s)",
                    color: "var(--ink-2)",
                    fontWeight: 600,
                    alignSelf: "center",
                    textDecoration: "underline",
                  }}
                >
                  Edit / hide
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

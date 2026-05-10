import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { forceRelistNudge } from "@/lib/actions/admin-dresses";
import { Button } from "../../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dress — Admin" };

type DressRow = {
  dress_id: string;
  designer_name: string | null;
  model: string | null;
  year: number | null;
  silhouette_label: string | null;
  fabric_label: string | null;
  neckline_label: string | null;
  sleeve_label: string | null;
  length_label: string | null;
  size_label: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  color: string | null;
  original_retail_cents: number | null;
  disposition: string;
  display_disposition: string;
  created_at: string;
  next_relist_nudge_at: string | null;
  last_relist_nudge_sent_at: string | null;
  creator_id: string | null;
  creator_email: string | null;
  creator_first_name: string | null;
  creator_surname: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_first_name: string | null;
  owner_surname: string | null;
};

type ListingRow = {
  id: string;
  title: string;
  price_cents: number;
  created_at: string;
  sold_at: string | null;
  is_draft: boolean;
  is_published: boolean;
  seller_id: string | null;
  seller_email: string | null;
  seller_first_name: string | null;
  seller_surname: string | null;
  buyer_id: string | null;
  buyer_email: string | null;
  buyer_first_name: string | null;
  buyer_surname: string | null;
  primary_image_id: string | null;
};

async function fetchDress(id: string): Promise<DressRow | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<DressRow>(
      `SELECT d.id::text                              AS dress_id,
              des.name                                 AS designer_name,
              d.model,
              d.year,
              sil.label                                AS silhouette_label,
              fab.label                                AS fabric_label,
              nec.label                                AS neckline_label,
              sle.label                                AS sleeve_label,
              len.label                                AS length_label,
              sz.label                                 AS size_label,
              d.bust_inches::text                      AS bust_inches,
              d.waist_inches::text                     AS waist_inches,
              d.hips_inches::text                      AS hips_inches,
              d.color,
              d.original_retail_cents,
              d.disposition,
              CASE
                WHEN d.disposition = 'available' AND EXISTS (
                  SELECT 1 FROM listings l
                   WHERE l.dress_id     = d.id
                     AND l.is_draft     = FALSE
                     AND l.is_published = TRUE
                     AND l.sold_at IS NULL
                ) THEN 'listed'
                WHEN d.disposition = 'available' THEN 'drafted'
                ELSE d.disposition
              END                                      AS display_disposition,
              d.created_at::text                       AS created_at,
              d.next_relist_nudge_at::text             AS next_relist_nudge_at,
              d.last_relist_nudge_sent_at::text        AS last_relist_nudge_sent_at,
              d.created_by_user_id::text               AS creator_id,
              creator.email                            AS creator_email,
              creator.first_name                       AS creator_first_name,
              creator.surname                          AS creator_surname,
              d.current_owner_user_id::text            AS owner_id,
              owner.email                              AS owner_email,
              owner.first_name                         AS owner_first_name,
              owner.surname                            AS owner_surname
         FROM dresses d
         LEFT JOIN designers     des     ON des.id = d.designer_id
         LEFT JOIN silhouettes   sil     ON sil.id = d.silhouette_id
         LEFT JOIN fabrics       fab     ON fab.id = d.fabric_id
         LEFT JOIN necklines     nec     ON nec.id = d.neckline_id
         LEFT JOIN sleeve_styles sle     ON sle.id = d.sleeve_style_id
         LEFT JOIN dress_lengths len     ON len.id = d.length_id
         LEFT JOIN dress_sizes   sz      ON sz.id  = d.size_id
         LEFT JOIN users         creator ON creator.id = d.created_by_user_id
         LEFT JOIN users         owner   ON owner.id   = d.current_owner_user_id
        WHERE d.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchListings(dressId: string): Promise<ListingRow[]> {
  try {
    const r = await query<ListingRow>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.created_at::text,
              l.sold_at::text,
              l.is_draft,
              l.is_published,
              l.seller_id::text,
              seller.email                            AS seller_email,
              seller.first_name                       AS seller_first_name,
              seller.surname                          AS seller_surname,
              l.sold_to_user_id::text                 AS buyer_id,
              buyer.email                             AS buyer_email,
              buyer.first_name                        AS buyer_first_name,
              buyer.surname                           AS buyer_surname,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              )                                       AS primary_image_id
         FROM listings l
         LEFT JOIN users seller ON seller.id = l.seller_id
         LEFT JOIN users buyer  ON buyer.id  = l.sold_to_user_id
        WHERE l.dress_id = $1::bigint
        ORDER BY l.created_at DESC`,
      [dressId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function formatDateTime(s: string | null): string {
  if (!s) return "—";
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

function priceFormat(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function dispositionPill(d: string): { bg: string; fg: string; label: string } {
  switch (d) {
    case "in-use":
      return { bg: "#dcfce7", fg: "#166534", label: "In use" };
    case "listed":
      return { bg: "#cffafe", fg: "#155e75", label: "Listed" };
    case "drafted":
      return { bg: "#e5e7eb", fg: "#374151", label: "Drafted" };
    case "kept":
      return { bg: "#e0e7ff", fg: "#3730a3", label: "Kept" };
    case "lost":
      return { bg: "#fee2e2", fg: "#991b1b", label: "Lost" };
    default:
      return { bg: "#e5e7eb", fg: "#374151", label: d };
  }
}

function userLabel(
  email: string | null,
  first: string | null,
  surname: string | null,
): string {
  const name = [first, surname].filter(Boolean).join(" ").trim();
  return name || email || "(unknown)";
}

function dressTitle(d: DressRow): string {
  return (
    [d.designer_name, d.model].filter(Boolean).join(" ") || "Untitled dress"
  );
}

function measurements(d: DressRow): string | null {
  const parts: string[] = [];
  if (d.bust_inches) parts.push(`bust ${d.bust_inches}"`);
  if (d.waist_inches) parts.push(`waist ${d.waist_inches}"`);
  if (d.hips_inches) parts.push(`hips ${d.hips_inches}"`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function listingStatus(l: ListingRow): {
  bg: string;
  fg: string;
  label: string;
} {
  if (l.sold_at)
    return { bg: "#e0e7ff", fg: "#3730a3", label: "Sold" };
  if (l.is_draft) return { bg: "#fef3c7", fg: "#92400e", label: "Draft" };
  if (!l.is_published)
    return { bg: "#fee2e2", fg: "#991b1b", label: "Hidden" };
  return { bg: "#dcfce7", fg: "#166534", label: "Active" };
}

export default async function AdminDressDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [dress, listings] = await Promise.all([
    fetchDress(id),
    fetchListings(id),
  ]);
  if (!dress) notFound();

  const pill = dispositionPill(dress.display_disposition);
  const eligibleForNudge = dress.disposition === "in-use";
  const measurementsLine = measurements(dress);

  return (
    <div className="page admin-page" style={{ maxWidth: 1080 }}>
      <Link href="/admin/dresses" className="back-link">
        ← All dresses
      </Link>

      <header className="admin-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 4,
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
              background: pill.bg,
              color: pill.fg,
            }}
          >
            {pill.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-4)",
              letterSpacing: "0.08em",
            }}
          >
            Dress #{dress.dress_id}
          </span>
        </div>
        <h1 style={{ marginBottom: 4 }}>{dressTitle(dress)}</h1>
        <p className="sub" style={{ margin: 0 }}>
          {[
            dress.year,
            dress.size_label && `size ${dress.size_label}`,
            dress.color,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--s-4)",
          marginBottom: "var(--s-6)",
        }}
      >
        <section
          className="form-card"
          style={{ padding: "var(--s-5)" }}
        >
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Specs
          </h2>
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
            <SpecRow k="Designer" v={dress.designer_name} />
            <SpecRow k="Model" v={dress.model} />
            <SpecRow k="Year" v={dress.year} />
            <SpecRow k="Silhouette" v={dress.silhouette_label} />
            <SpecRow k="Fabric" v={dress.fabric_label} />
            <SpecRow k="Neckline" v={dress.neckline_label} />
            <SpecRow k="Sleeves" v={dress.sleeve_label} />
            <SpecRow k="Length" v={dress.length_label} />
            <SpecRow k="Size" v={dress.size_label} />
            <SpecRow k="Color" v={dress.color} />
            <SpecRow k="Measurements" v={measurementsLine} />
            <SpecRow
              k="Original retail"
              v={
                dress.original_retail_cents
                  ? priceFormat(dress.original_retail_cents)
                  : null
              }
            />
          </dl>
        </section>

        <section
          className="form-card"
          style={{ padding: "var(--s-5)" }}
        >
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Lifecycle
          </h2>
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
            <SpecRow k="Created" v={formatDate(dress.created_at)} />
            <SpecRow
              k="Created by"
              v={
                dress.creator_id ? (
                  <Link
                    href={`/admin/users/${dress.creator_id}`}
                    style={{ color: "var(--ink-1)" }}
                  >
                    {userLabel(
                      dress.creator_email,
                      dress.creator_first_name,
                      dress.creator_surname,
                    )}
                  </Link>
                ) : null
              }
            />
            <SpecRow
              k="Current owner"
              v={
                dress.owner_id ? (
                  <Link
                    href={`/admin/users/${dress.owner_id}`}
                    style={{ color: "var(--ink-1)" }}
                  >
                    {userLabel(
                      dress.owner_email,
                      dress.owner_first_name,
                      dress.owner_surname,
                    )}
                  </Link>
                ) : null
              }
            />
            <SpecRow
              k="Next nudge"
              v={formatDateTime(dress.next_relist_nudge_at)}
            />
            <SpecRow
              k="Last sent"
              v={formatDateTime(dress.last_relist_nudge_sent_at)}
            />
          </dl>

          <form
            action={forceRelistNudge}
            style={{ marginTop: "var(--s-4)" }}
          >
            <input type="hidden" name="dressId" value={dress.dress_id} />
            <Button
              type="submit"
              variant={eligibleForNudge ? "primary" : "ghost"}
              size="sm"
              disabled={!eligibleForNudge}
              title={
                eligibleForNudge
                  ? "Force-send a relist nudge to the current owner"
                  : `Not eligible — disposition is '${dress.display_disposition}'`
              }
            >
              Send relist nudge
            </Button>
          </form>
        </section>
      </div>

      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 className="detail-specs-heading" style={{ marginBottom: "var(--s-4)" }}>
          Listing history{" "}
          <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
            ({listings.length})
          </span>
        </h2>
        {listings.length === 0 ? (
          <p style={{ color: "var(--ink-3)" }}>
            No listings recorded for this dress.
          </p>
        ) : (
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              position: "relative",
            }}
          >
            {/* Vertical rail behind the dots */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 14,
                top: 8,
                bottom: 8,
                width: 2,
                background: "var(--hairline)",
              }}
            />
            {listings.map((l) => {
              const status = listingStatus(l);
              return (
                <li
                  key={l.id}
                  style={{
                    position: "relative",
                    paddingLeft: 48,
                    paddingBottom: "var(--s-4)",
                  }}
                >
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 6,
                      top: 10,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      background: l.sold_at
                        ? "#3730a3"
                        : l.is_draft
                          ? "#92400e"
                          : "#166534",
                      border: "3px solid var(--surface)",
                      boxShadow: "0 0 0 1px var(--hairline)",
                    }}
                  />
                  <div
                    className="form-card"
                    style={{
                      display: "grid",
                      gridTemplateColumns: l.primary_image_id
                        ? "80px 1fr"
                        : "1fr",
                      gap: "var(--s-4)",
                      padding: "var(--s-4)",
                    }}
                  >
                    {l.primary_image_id && (
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/listings/${l.id}/images/${l.primary_image_id}?w=200`}
                          alt=""
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 4,
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
                            background: status.bg,
                            color: status.fg,
                          }}
                        >
                          {status.label}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-4)",
                          }}
                        >
                          Listing #{l.id}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-4)",
                          }}
                        >
                          {formatDate(l.created_at)}
                        </span>
                      </div>
                      <Link
                        href={`/listings/${l.id}`}
                        style={{
                          fontWeight: 700,
                          color: "var(--ink-1)",
                          textDecoration: "none",
                          display: "block",
                        }}
                      >
                        {l.title || "(no title)"}
                      </Link>
                      <div
                        style={{
                          fontSize: "var(--t-body-s)",
                          color: "var(--ink-3)",
                          marginTop: 2,
                        }}
                      >
                        {priceFormat(l.price_cents)}
                        {" · listed by "}
                        {l.seller_id ? (
                          <Link
                            href={`/admin/users/${l.seller_id}`}
                            style={{ color: "var(--ink-2)" }}
                          >
                            {userLabel(
                              l.seller_email,
                              l.seller_first_name,
                              l.seller_surname,
                            )}
                          </Link>
                        ) : (
                          "(unknown)"
                        )}
                      </div>
                      {l.sold_at && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--ink-4)",
                            marginTop: 2,
                          }}
                        >
                          Sold {formatDate(l.sold_at)}
                          {l.buyer_id ? (
                            <>
                              {" to "}
                              <Link
                                href={`/admin/users/${l.buyer_id}`}
                                style={{ color: "var(--ink-3)" }}
                              >
                                {userLabel(
                                  l.buyer_email,
                                  l.buyer_first_name,
                                  l.buyer_surname,
                                )}
                              </Link>
                            </>
                          ) : (
                            " (buyer unknown — sold elsewhere)"
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function SpecRow({
  k,
  v,
}: {
  k: string;
  v: React.ReactNode;
}) {
  if (v == null || v === "" || v === "—") {
    return (
      <>
        <dt
          style={{
            color: "var(--ink-4)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {k}
        </dt>
        <dd style={{ margin: 0, color: "var(--ink-4)" }}>—</dd>
      </>
    );
  }
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
      <dd style={{ margin: 0, color: "var(--ink-1)" }}>{v}</dd>
    </>
  );
}

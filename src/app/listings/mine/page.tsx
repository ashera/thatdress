import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { startDraftListing } from "@/lib/actions/listing-wizard";
import { Button } from "../../_components/ui";
import {
  ListingRow,
  listingFromRow,
  type ListingCardRow,
} from "../../_components/listing-card";

export const dynamic = "force-dynamic";

type Row = ListingCardRow & {
  is_published: boolean;
  view_count: string;
  view_count_7d: string;
};

type DraftItem = {
  id: string;
  title: string | null;
  has_basics: boolean;
  has_style: boolean;
  has_condition: boolean;
};

function nextStepFor(d: DraftItem): string {
  if (!d.has_basics) return `/listings/new/${d.id}/photos`;
  if (!d.has_style) return `/listings/new/${d.id}/style`;
  if (!d.has_condition) return `/listings/new/${d.id}/condition`;
  return `/listings/new/${d.id}/publish`;
}

async function fetchDrafts(userId: string): Promise<DraftItem[]> {
  try {
    const r = await query<DraftItem>(
      `SELECT id::text,
              title,
              (title <> '' AND designer_id IS NOT NULL AND model IS NOT NULL) AS has_basics,
              (occasion_id IS NOT NULL) AS has_style,
              (condition_id IS NOT NULL) AS has_condition
         FROM listings
        WHERE seller_id = $1::bigint AND is_draft = TRUE
        ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function fetchOwnListings(
  userId: string,
): Promise<{ ok: true; rows: Row[] } | { ok: false; error: string }> {
  try {
    const result = await query<Row>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              u.email AS seller_email,
              l.is_published,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              d.name    AS designer_name,
              l.model,
              l.year,
              cg.label  AS condition_label,
              o.label   AS occasion_label,
              s.label   AS silhouette_label,
              f.label   AS fabric_label,
              ds.label  AS size_label,
              n.label   AS neckline_label,
              ss.label  AS sleeve_style_label,
              dl.label  AS length_label,
              l.location_postal,
              l.color,
              l.bust_inches::text,
              l.waist_inches::text,
              l.hips_inches::text,
              l.original_retail_cents,
              l.has_original_receipt,
              l.sold_at::text,
              (
                SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
                  WHERE listing_id = l.id
              ) AS conversation_count,
              (
                SELECT COUNT(*)::text FROM listing_views
                  WHERE listing_id = l.id
              ) AS view_count,
              (
                SELECT COUNT(*)::text FROM listing_views
                  WHERE listing_id = l.id
                    AND viewed_at > NOW() - INTERVAL '7 days'
              ) AS view_count_7d
         FROM listings l
         LEFT JOIN users            u   ON u.id   = l.seller_id
         LEFT JOIN designers        d   ON d.id   = l.designer_id
         LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
         LEFT JOIN occasions        o   ON o.id   = l.occasion_id
         LEFT JOIN silhouettes      s   ON s.id   = l.silhouette_id
         LEFT JOIN fabrics          f   ON f.id   = l.fabric_id
         LEFT JOIN dress_sizes      ds  ON ds.id  = l.size_id
         LEFT JOIN necklines        n   ON n.id   = l.neckline_id
         LEFT JOIN sleeve_styles    ss  ON ss.id  = l.sleeve_style_id
         LEFT JOIN dress_lengths    dl  ON dl.id  = l.length_id
        WHERE l.seller_id = $1::bigint
          AND l.is_draft = FALSE
        ORDER BY l.is_published DESC, l.created_at DESC
        LIMIT 200`,
      [userId],
    );
    return { ok: true, rows: result.rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [result, drafts] = await Promise.all([
    fetchOwnListings(user.id),
    fetchDrafts(user.id),
  ]);
  const total = result.ok ? result.rows.length : 0;
  const hidden = result.ok
    ? result.rows.filter((r) => !r.is_published).length
    : 0;

  return (
    <div className="page page--pad">
      <header className="my-listings-header">
        <p className="eyebrow">Your wardrobe</p>
        <h1>Sell a dress</h1>
        <p className="sub">
          We&rsquo;ll walk you through it in five short steps: photos &amp;
          basics, style, size &amp; fit, condition, and pricing.
        </p>
      </header>

      <section
        className="form-card"
        style={{
          marginBottom: "var(--s-7)",
          padding: "var(--s-5) var(--s-6)",
          background: "var(--volt-50)",
          border: "1px solid var(--volt-100)",
          display: "flex",
          alignItems: "center",
          gap: "var(--s-5)",
        }}
      >
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <h2 className="card-heading" style={{ margin: 0 }}>
            Start a new listing
          </h2>
          <p
            className="card-sub"
            style={{ marginTop: 4, marginBottom: "var(--s-4)" }}
          >
            Listings are free to post. We never take a commission.
          </p>
          <form action={startDraftListing}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Start a new listing
            </Button>
          </form>
        </div>
        <div
          aria-hidden
          className="start-listing-art"
          style={{
            position: "relative",
            flex: "0 0 auto",
            width: 120,
            height: 160,
          }}
        >
          <Image
            src="/dress-sketch-tr-back.png"
            alt=""
            fill
            sizes="120px"
            style={{ objectFit: "contain", opacity: 0.85 }}
          />
        </div>
      </section>

      {drafts.length > 0 && (
        <section
          style={{
            marginBottom: "var(--s-7)",
            padding: "var(--s-4) var(--s-5)",
            background: "var(--surface-2, #f7f6f3)",
            border: "1px solid var(--line, #e9e5df)",
            borderRadius: 12,
          }}
        >
          <h2 className="card-heading" style={{ margin: 0 }}>
            Drafts in progress
          </h2>
          <p className="card-sub" style={{ marginTop: 4 }}>
            {drafts.length === 1
              ? "1 listing not finished yet."
              : `${drafts.length} listings not finished yet.`}
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "var(--s-3) 0 0",
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-2)",
            }}
          >
            {drafts.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--s-3)",
                  background: "#fff",
                  border: "1px solid var(--line, #e9e5df)",
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                    {d.title?.trim() || "Untitled draft"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    {!d.has_basics
                      ? "Step 1 of 5 — photos & basics"
                      : !d.has_style
                      ? "Step 2 of 5 — style"
                      : !d.has_condition
                      ? "Step 4 of 5 — condition"
                      : "Step 5 of 5 — publish"}
                  </div>
                </div>
                <Link
                  href={nextStepFor(d)}
                  style={{
                    fontWeight: 600,
                    fontSize: "var(--t-body-s)",
                    color: "var(--ink-1)",
                    textDecoration: "none",
                  }}
                >
                  Continue →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <header style={{ marginBottom: "var(--s-5)" }}>
        <h2
          className="card-heading"
          style={{ margin: 0, fontSize: 22 }}
        >
          Your published listings
        </h2>
        <p className="card-sub" style={{ marginTop: 4 }}>
          {total === 0
            ? "You haven't posted any listings yet."
            : `${total} total · ${hidden} hidden from public browse.`}
        </p>
      </header>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load your listings.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No listings yet</h3>
          <p style={{ margin: 0 }}>
            Start your first one with the button above.
          </p>
        </div>
      ) : (
        <div className="results-rows">
          {result.rows.map((row) => (
            <div
              key={row.id}
              className={`my-listing-wrap ${row.is_published ? "" : "is-hidden"}`}
            >
              {!row.is_published && (
                <span className="my-listing-flag">Hidden</span>
              )}
              <ListingRow data={listingFromRow(row)} />
              <div className="my-listing-stats">
                <span>
                  <strong>{row.view_count}</strong> view
                  {row.view_count === "1" ? "" : "s"}
                </span>
                <span>
                  <strong>{row.view_count_7d}</strong> in 7 days
                </span>
                <span>
                  <strong>{row.conversation_count ?? 0}</strong> conversation
                  {row.conversation_count === "1" ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

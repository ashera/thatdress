import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { startDraftListing } from "@/lib/actions/listing-wizard";
import { computeHealth } from "@/lib/listing-health";
import { getSellerStats, type SellerStats } from "@/lib/listing-views";
import { loadSiteSettings } from "@/lib/site-settings";
import { confirmListingStillAvailable } from "@/lib/actions/listings";
import { Button } from "../../_components/ui";
import {
  ListingRow,
  listingFromRow,
  type ListingCardRow,
} from "../../_components/listing-card";
import {
  MarkSoldDialog,
  type BuyerOption,
} from "../../_components/mark-sold-dialog";

export const dynamic = "force-dynamic";

type Row = ListingCardRow & {
  is_published: boolean;
  view_count: string;
  view_count_7d: string;
  /** Triggers the sale-nudge banner on a listing card. True when the
   *  listing has been live for >14 days without seller confirmation,
   *  OR when an admin force-fired a nudge more recently than the
   *  freshness anchor. */
  needs_nudge: boolean;
  days_old: string;
};

type DraftItem = {
  id: string;
  title: string | null;
  has_basics: boolean;
  has_style: boolean;
  has_condition: boolean;
  /** Health score 0–100 — surfaces as a small progress chip next to
   *  each draft so the seller sees how complete the listing is. */
  health_score: number;
};

type DraftRowFromDb = {
  id: string;
  title: string | null;
  designer_id: string | null;
  model: string | null;
  year: number | null;
  occasion_id: string | null;
  condition_id: string | null;
  size_id: string | null;
  silhouette_id: string | null;
  fabric_id: string | null;
  neckline_id: string | null;
  sleeve_style_id: string | null;
  length_id: string | null;
  color: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  original_retail_cents: number | null;
  has_original_receipt: boolean | null;
  is_authentic_declared: boolean | null;
  includes_label_lining_photos: boolean | null;
  description: string | null;
  image_count: string;
};

function nextStepFor(d: DraftItem): string {
  if (!d.has_basics) return `/listings/new/${d.id}/basics`;
  if (!d.has_style) return `/listings/new/${d.id}/style`;
  if (!d.has_condition) return `/listings/new/${d.id}/condition`;
  return `/listings/new/${d.id}/publish`;
}

async function fetchDrafts(userId: string): Promise<DraftItem[]> {
  try {
    const r = await query<DraftRowFromDb>(
      `SELECT id::text, title,
              designer_id::text, model, year,
              occasion_id::text, condition_id::text, size_id::text,
              silhouette_id::text, fabric_id::text, neckline_id::text,
              sleeve_style_id::text, length_id::text, color,
              bust_inches::text, waist_inches::text, hips_inches::text,
              original_retail_cents, has_original_receipt,
              is_authentic_declared, includes_label_lining_photos,
              description,
              (SELECT COUNT(*)::text FROM listing_images WHERE listing_id = listings.id) AS image_count
         FROM listings
        WHERE seller_id = $1::bigint AND is_draft = TRUE
        ORDER BY created_at DESC`,
      [userId],
    );
    return r.rows.map((d) => {
      const num = (s: string | null): number | null => {
        if (s == null || s === "") return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };
      const { score } = computeHealth({
        designerId: d.designer_id,
        model: d.model,
        year: d.year,
        occasionId: d.occasion_id,
        conditionId: d.condition_id,
        sizeId: d.size_id,
        silhouetteId: d.silhouette_id,
        fabricId: d.fabric_id,
        necklineId: d.neckline_id,
        sleeveStyleId: d.sleeve_style_id,
        lengthId: d.length_id,
        color: d.color,
        bustInches: num(d.bust_inches),
        waistInches: num(d.waist_inches),
        hipsInches: num(d.hips_inches),
        originalRetailCents: d.original_retail_cents,
        hasOriginalReceipt: !!d.has_original_receipt,
        isAuthenticDeclared: !!d.is_authentic_declared,
        includesLabelLiningPhotos: !!d.includes_label_lining_photos,
        description: d.description,
        imageCount: Number(d.image_count ?? 0),
      });
      return {
        id: d.id,
        title: d.title,
        has_basics:
          (d.title?.length ?? 0) > 0 &&
          d.designer_id != null &&
          d.model != null,
        has_style: d.occasion_id != null,
        has_condition: d.condition_id != null,
        health_score: score,
      };
    });
  } catch {
    return [];
  }
}

/** Buyers (one row per listing+buyer pair) the seller's listings
 *  have ever conversed with. Used to populate the MarkSoldDialog
 *  picker in one round-trip — bucketed in memory by listing id. */
async function fetchBuyersByListing(
  sellerId: string,
): Promise<Map<string, BuyerOption[]>> {
  try {
    const r = await query<{
      listing_id: string;
      buyer_id: string | null;
      buyer_email: string | null;
      msg_count: string;
    }>(
      `SELECT c.listing_id::text  AS listing_id,
              c.buyer_id::text    AS buyer_id,
              u.email             AS buyer_email,
              (
                SELECT COUNT(*)::text FROM messages
                  WHERE conversation_id = c.id
              )                   AS msg_count
         FROM conversations c
         LEFT JOIN users u ON u.id = c.buyer_id
         JOIN listings l ON l.id = c.listing_id
        WHERE l.seller_id = $1::bigint`,
      [sellerId],
    );
    const map = new Map<string, BuyerOption[]>();
    for (const row of r.rows) {
      if (!row.buyer_id || !row.buyer_email) continue;
      const arr = map.get(row.listing_id) ?? [];
      arr.push({
        id: row.buyer_id,
        email: row.buyer_email,
        messageCount: Number(row.msg_count ?? 0),
      });
      map.set(row.listing_id, arr);
    }
    return map;
  } catch {
    return new Map();
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
              l.trust_status,
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
              ) AS view_count_7d,
              (
                l.is_published = TRUE
                AND l.is_draft = FALSE
                AND l.sold_at IS NULL
                AND (
                  -- Auto-trigger: nothing fresh in the last 14 days.
                  GREATEST(
                    l.created_at,
                    COALESCE(l.last_active_confirmed_at, l.created_at)
                  ) < NOW() - INTERVAL '14 days'
                  -- OR admin force-fired since the last activity.
                  OR (
                    l.last_sale_nudge_sent_at IS NOT NULL
                    AND l.last_sale_nudge_sent_at > GREATEST(
                      l.created_at,
                      COALESCE(l.last_active_confirmed_at, l.created_at)
                    )
                  )
                )
              ) AS needs_nudge,
              EXTRACT(DAY FROM NOW() - l.created_at)::text AS days_old
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

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ nudge?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = searchParams ? await searchParams : {};
  const nudgeFlash = sp.nudge ?? null;

  const [result, drafts, settings, stats, buyersByListing] =
    await Promise.all([
      fetchOwnListings(user.id),
      fetchDrafts(user.id),
      loadSiteSettings(),
      getSellerStats(user.id),
      fetchBuyersByListing(user.id),
    ]);
  const verifiedThreshold = settings.healthThresholdVerified;
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
          We&rsquo;ll walk you through it in six short steps: basics,
          photos, style, size &amp; fit, condition, and pricing.
        </p>
      </header>

      {nudgeFlash === "confirmed" && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Thanks — keeping that one on browse.
        </p>
      )}

      {(stats.activeListings > 0 || stats.soldListings > 0) && (
        <SellerStatsPanel stats={stats} />
      )}

      <section
        className="form-card"
        style={{
          marginBottom: "var(--s-7)",
          padding: "var(--s-5) var(--s-6)",
          background: "var(--volt-50)",
          border: "1px solid var(--volt-100)",
          // .form-card defaults to flex-direction: column — override
          // here so the dress-sketch art sits to the right of the
          // text content rather than below it.
          display: "flex",
          flexDirection: "row",
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
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                    {d.title?.trim() || "Untitled draft"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "var(--ink-3)",
                      marginTop: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {!d.has_basics
                        ? "Step 1 of 5 — photos & basics"
                        : !d.has_style
                        ? "Step 2 of 5 — style"
                        : !d.has_condition
                        ? "Step 4 of 5 — condition"
                        : "Step 5 of 5 — publish"}
                    </span>
                    <span aria-hidden style={{ color: "var(--hairline-strong)" }}>
                      ·
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.08em",
                        color:
                          d.health_score >= verifiedThreshold
                            ? "var(--volt-700)"
                            : "var(--ink-3)",
                        fontWeight: 700,
                      }}
                      title={
                        d.health_score >= verifiedThreshold
                          ? "Listing health is high enough to earn the Verified badge on publish."
                          : `Reach ${verifiedThreshold} to earn the Verified badge.`
                      }
                    >
                      Health {d.health_score}/100
                      {d.health_score >= verifiedThreshold && " ✓"}
                    </span>
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
              {row.needs_nudge && (
                <SaleNudgeBanner
                  listingId={row.id}
                  daysOld={Number(row.days_old ?? 0)}
                  buyers={buyersByListing.get(row.id) ?? []}
                />
              )}
              <ListingRow
                data={listingFromRow(
                  row,
                  user.id,
                  null,
                  settings.reviewsDisplayThreshold,
                )}
              />
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

function StatTile({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          color: "var(--ink-1)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </div>
  );
}

function SellerStatsPanel({ stats }: { stats: SellerStats }) {
  return (
    <section
      style={{
        marginBottom: "var(--s-7)",
        padding: "var(--s-5) var(--s-6)",
        background: "var(--surface-sunken)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-h3)",
          margin: "0 0 var(--s-3)",
          color: "var(--ink-1)",
        }}
      >
        Your stats
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--s-3)",
        }}
      >
        <StatTile
          value={stats.activeListings}
          label="Active listings"
          hint={
            stats.soldListings > 0
              ? `${stats.soldListings} sold`
              : undefined
          }
        />
        <StatTile
          value={stats.viewsLast7}
          label="Views (7 days)"
          hint={`${stats.totalViews} all-time`}
        />
        <StatTile
          value={stats.uniqueViewers}
          label="Unique viewers"
        />
        <StatTile
          value={stats.conversations}
          label="Buyer conversations"
        />
        <StatTile
          value={stats.openOffers}
          label="Open offers"
        />
      </div>

      {stats.topListing && stats.topListing.views7 > 0 && (
        <Link
          href={`/listings/${stats.topListing.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-3)",
            marginTop: "var(--s-4)",
            padding: "10px 12px",
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            textDecoration: "none",
            color: "var(--ink-1)",
          }}
        >
          {stats.topListing.primary_image_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/listings/${stats.topListing.id}/images/${stats.topListing.primary_image_id}?w=200`}
              alt=""
              style={{
                width: 40,
                height: 53,
                objectFit: "cover",
                borderRadius: 6,
                background: "var(--surface-sunken)",
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              Top listing this week
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                color: "var(--ink-1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {stats.topListing.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {stats.topListing.views7} views in the last 7 days
            </div>
          </div>
          <span aria-hidden style={{ color: "var(--ink-3)" }}>
            →
          </span>
        </Link>
      )}
    </section>
  );
}

function SaleNudgeBanner({
  listingId,
  daysOld,
  buyers,
}: {
  listingId: string;
  daysOld: number;
  buyers: BuyerOption[];
}) {
  return (
    <div
      style={{
        margin: "0 0 var(--s-3)",
        padding: "10px 14px",
        background: "#fef3c7",
        border: "1px solid #fcd34d",
        borderRadius: 10,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
      role="status"
    >
      <div
        style={{
          flex: "1 1 240px",
          minWidth: 0,
          fontSize: 14,
          color: "#92400e",
          lineHeight: 1.45,
        }}
      >
        <strong style={{ color: "#7c2d12" }}>
          Is this dress still for sale?
        </strong>{" "}
        <span>
          It&rsquo;s been on frockd for {daysOld} day
          {daysOld === 1 ? "" : "s"}. Confirm to keep it on browse, or
          mark sold to free up the slot.
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <form action={confirmListingStillAvailable}>
          <input type="hidden" name="listingId" value={listingId} />
          <button
            type="submit"
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: "#92400e",
              color: "#fff",
              border: 0,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Still for sale
          </button>
        </form>
        <MarkSoldDialog
          listingId={listingId}
          buyers={buyers}
          next="/listings/mine"
          buttonLabel="Mark as sold"
          buttonVariant="ghost"
        />
      </div>
    </div>
  );
}

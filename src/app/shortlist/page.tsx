import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getShortlistIds } from "@/lib/shortlist";
import { loadSiteSettings } from "@/lib/site-settings";
import {
  ignoreFromShortlist,
  reinstateShortlist,
  removeFromShortlist,
} from "@/lib/actions/shortlist";
import { Button, ButtonLink } from "../_components/ui";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "../_components/listing-card";

export const dynamic = "force-dynamic";

type Row = ListingCardRow & {
  shortlisted_at: string;
  ignored_at: string | null;
};

async function fetchShortlistedListings(userId: string) {
  try {
    const result = await query<Row>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.seller_id::text,
              u.email AS seller_email,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              d.name    AS designer_name,
              dr.model  AS model,
              dr.year   AS year,
              cg.label  AS condition_label,
              o.label   AS occasion_label,
              sl.label  AS silhouette_label,
              f.label   AS fabric_label,
              ds.label  AS size_label,
              n.label   AS neckline_label,
              ss.label  AS sleeve_style_label,
              dl.label  AS length_label,
              l.location_postal,
              dr.color  AS color,
              dr.bust_inches::text  AS bust_inches,
              dr.waist_inches::text AS waist_inches,
              dr.hips_inches::text  AS hips_inches,
              dr.original_retail_cents AS original_retail_cents,
              l.has_original_receipt,
              l.trust_status,
              l.is_published,
              l.sold_at::text,
              l.is_featured,
              (
                SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
                  WHERE listing_id = l.id
              ) AS conversation_count,
              s.created_at::text AS shortlisted_at,
              s.ignored_at::text AS ignored_at
         FROM shortlists s
         JOIN listings l ON l.id = s.listing_id
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN users            u   ON u.id   = l.seller_id
         LEFT JOIN designers        d   ON d.id   = dr.designer_id
         LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
         LEFT JOIN occasions        o   ON o.id   = l.occasion_id
         LEFT JOIN silhouettes      sl  ON sl.id  = dr.silhouette_id
         LEFT JOIN fabrics          f   ON f.id   = dr.fabric_id
         LEFT JOIN dress_sizes      ds  ON ds.id  = dr.size_id
         LEFT JOIN necklines        n   ON n.id   = dr.neckline_id
         LEFT JOIN sleeve_styles    ss  ON ss.id  = dr.sleeve_style_id
         LEFT JOIN dress_lengths    dl  ON dl.id  = dr.length_id
        WHERE s.user_id = $1::bigint
        ORDER BY (s.ignored_at IS NOT NULL), s.created_at DESC`,
      [userId],
    );
    return { ok: true as const, rows: result.rows };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function ManageControls({
  listingId,
  ignored,
}: {
  listingId: string;
  ignored: boolean;
}) {
  if (!ignored) {
    return (
      <form action={ignoreFromShortlist} className="shortlist-manage">
        <input type="hidden" name="listingId" value={listingId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          title="Move to ignored"
        >
          Ignore
        </Button>
      </form>
    );
  }
  return (
    <div className="shortlist-manage">
      <form action={reinstateShortlist}>
        <input type="hidden" name="listingId" value={listingId} />
        <Button type="submit" variant="primary" size="sm">
          Reinstate
        </Button>
      </form>
      <form action={removeFromShortlist}>
        <input type="hidden" name="listingId" value={listingId} />
        <Button type="submit" variant="ghost" size="sm">
          Remove
        </Button>
      </form>
    </div>
  );
}

export default async function ShortlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/shortlist");

  const [result, ids, settings] = await Promise.all([
    fetchShortlistedListings(user.id),
    getShortlistIds(user.id),
    loadSiteSettings(),
  ]);
  const reviewsThreshold = settings.reviewsDisplayThreshold;

  const total = result.ok ? result.rows.length : 0;
  const activeCount = result.ok
    ? result.rows.filter((r) => !r.ignored_at).length
    : 0;
  const ignoredCount = total - activeCount;

  return (
    <div className="page page--pad">
      <header className="messages-header">
        <p className="eyebrow">Saved</p>
        <h1>Your shortlist</h1>
        <p className="sub">
          {total === 0
            ? "Nothing saved yet."
            : `${activeCount} saved${ignoredCount > 0 ? ` · ${ignoredCount} ignored` : ""}.`}
        </p>
      </header>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load your shortlist.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No saved listings yet</h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            Tap the <strong>♥</strong> on any listing to save it for later.
          </p>
          <ButtonLink href="/listings" variant="primary" iconRight="arrow">
            Browse listings
          </ButtonLink>
        </div>
      ) : (
        <div className="results-grid">
          {result.rows.map((row) => {
            const data = listingFromRow(
              row,
              user.id,
              ids,
              reviewsThreshold,
            );
            // Hide the photo heart toggle on /shortlist — explicit
            // controls below the card handle ignore / reinstate / remove.
            data.showShortlist = false;
            const ignored = !!row.ignored_at;
            return (
              <div
                key={row.id}
                className={`shortlist-item ${ignored ? "is-ignored" : ""}`}
              >
                {ignored && <span className="shortlist-flag">Ignored</span>}
                <ListingCard data={data} />
                <ManageControls listingId={row.id} ignored={ignored} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

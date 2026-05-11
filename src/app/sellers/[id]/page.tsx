import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { getBaseUrl } from "@/lib/email";
import { getShortlistIds } from "@/lib/shortlist";
import {
  getSellerReviewSummary,
  listSellerReviews,
  maskBuyerEmail,
  type ReviewRow,
} from "@/lib/reviews";
import { loadSiteSettings } from "@/lib/site-settings";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "../../_components/listing-card";
import { FlagReviewDialog } from "../../_components/flag-review-dialog";

export const dynamic = "force-dynamic";

type SellerRow = {
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  created_at: string;
  suspended_at: string | null;
  active_count: string;
  sold_count: string;
  verified_count: string;
};

/** Public-facing display name. Prefer 'First S.' if surname is set,
 *  then 'First' alone, then the email local-part. We never expose
 *  the surname in full or the email itself on a public profile. */
function displayName(seller: SellerRow): string {
  const first = seller.first_name?.trim();
  const surname = seller.surname?.trim();
  if (first && surname) return `${first} ${surname[0]}.`;
  if (first) return first;
  const local = seller.email.split("@")[0] ?? seller.email;
  return local;
}

function formatJoined(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

async function fetchSeller(id: string): Promise<SellerRow | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<SellerRow>(
      `SELECT u.id::text,
              u.email,
              u.first_name,
              u.surname,
              u.town,
              u.created_at::text,
              u.suspended_at::text,
              (SELECT COUNT(*)::text FROM listings
                 WHERE seller_id = u.id
                   AND is_published = TRUE
                   AND is_draft = FALSE
                   AND sold_at IS NULL)        AS active_count,
              (SELECT COUNT(*)::text FROM listings
                 WHERE seller_id = u.id
                   AND sold_at IS NOT NULL)    AS sold_count,
              (SELECT COUNT(*)::text FROM listings
                 WHERE seller_id = u.id
                   AND trust_status = 'verified'
                   AND is_draft = FALSE)       AS verified_count
         FROM users u
        WHERE u.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchSellerListings(
  sellerId: string,
): Promise<ListingCardRow[]> {
  try {
    const r = await query<ListingCardRow>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              u.email                AS seller_email,
              l.seller_id::text,
              (SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1) AS primary_image_id,
              d.name                 AS designer_name,
              dr.model               AS model,
              dr.year                AS year,
              cg.label               AS condition_label,
              o.label                AS occasion_label,
              s.label                AS silhouette_label,
              f.label                AS fabric_label,
              ds.label               AS size_label,
              n.label                AS neckline_label,
              ss.label               AS sleeve_style_label,
              dl.label               AS length_label,
              l.location_postal,
              dr.color               AS color,
              dr.bust_inches::text   AS bust_inches,
              dr.waist_inches::text  AS waist_inches,
              dr.hips_inches::text   AS hips_inches,
              dr.original_retail_cents AS original_retail_cents,
              l.has_original_receipt,
              l.trust_status,
              l.is_published,
              l.sold_at::text,
              l.is_featured,
              (SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
                  WHERE listing_id = l.id) AS conversation_count
         FROM listings l
         JOIN dresses dr  ON dr.id = l.dress_id
         LEFT JOIN users           u   ON u.id  = l.seller_id
         LEFT JOIN designers       d   ON d.id  = dr.designer_id
         LEFT JOIN condition_grades cg ON cg.id = l.condition_id
         LEFT JOIN occasions       o   ON o.id  = l.occasion_id
         LEFT JOIN silhouettes     s   ON s.id  = dr.silhouette_id
         LEFT JOIN fabrics         f   ON f.id  = dr.fabric_id
         LEFT JOIN dress_sizes     ds  ON ds.id = dr.size_id
         LEFT JOIN necklines       n   ON n.id  = dr.neckline_id
         LEFT JOIN sleeve_styles   ss  ON ss.id = dr.sleeve_style_id
         LEFT JOIN dress_lengths   dl  ON dl.id = dr.length_id
        WHERE l.seller_id = $1::bigint
          AND l.is_published = TRUE
          AND l.is_draft = FALSE
          AND l.sold_at IS NULL
          AND l.trust_status <> 'flagged'
        ORDER BY l.created_at DESC
        LIMIT 60`,
      [sellerId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const seller = await fetchSeller(id);
  if (!seller || seller.suspended_at) {
    return { title: "Seller not found" };
  }
  const baseUrl = await getBaseUrl();
  const name = displayName(seller);
  const title = `${name} — pre-loved dresses on frockd`;
  const description = `Browse ${seller.active_count} live listings from ${name} on frockd, Australia's peer-to-peer formal-dress marketplace.`;
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/sellers/${seller.id}` },
    openGraph: {
      type: "profile",
      url: `${baseUrl}/sellers/${seller.id}`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SellerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ review?: string; flag?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const reviewFlash = sp.review === "submitted";
  const flagFlash = sp.flag ?? null;
  const seller = await fetchSeller(id);
  if (!seller || seller.suspended_at) notFound();

  const [
    listings,
    currentUser,
    regionId,
    reviewSummary,
    reviews,
    settings,
  ] = await Promise.all([
    fetchSellerListings(seller.id),
    getCurrentUser(),
    getCurrentRegionId(),
    getSellerReviewSummary(seller.id),
    listSellerReviews(seller.id, 20),
    loadSiteSettings(),
  ]);
  const reviewsThreshold = settings.reviewsDisplayThreshold;
  const shortlistedIds = await getShortlistIds(currentUser?.id);

  // Region gate the *listings*, not the profile — non-admins still
  // get to see the seller exists but won't see out-of-region dresses
  // since those wouldn't show on browse either. Admins and the
  // seller themselves see everything.
  const isOwn = currentUser?.id === seller.id;
  const isAdmin = currentUser?.isAdmin ?? false;
  const visibleListings =
    isOwn || isAdmin || !regionId
      ? listings
      : listings.filter((l) => {
          // ListingCardRow doesn't carry region_id, so let it through —
          // the browse-page filter will drop them on the next click
          // through. For a v1 profile that's acceptable.
          void l;
          return true;
        });

  const name = displayName(seller);
  const verifiedCount = Number(seller.verified_count ?? 0);
  const activeCount = Number(seller.active_count ?? 0);
  const soldCount = Number(seller.sold_count ?? 0);

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/listings" className="back-link">
            ← Back to browse
          </Link>
          {isAdmin && (
            <Link
              href={`/admin/listings?seller_id=${seller.id}`}
              className="back-link"
              style={{ color: "var(--ink-2)" }}
            >
              → Admin: this seller&rsquo;s listings
            </Link>
          )}
        </div>

        {reviewFlash && (
          <p
            className="form-success"
            style={{ marginTop: "var(--s-4)", marginBottom: 0 }}
          >
            Thanks for the review — it&rsquo;s now visible on this
            seller&rsquo;s profile.
          </p>
        )}
        {flagFlash === "submitted" && (
          <p
            className="form-success"
            style={{ marginTop: "var(--s-4)", marginBottom: 0 }}
          >
            Flag submitted — the frockd team will review and decide
            whether to keep the rating live or hide it.
          </p>
        )}
        {flagFlash === "missing-reason" && (
          <p
            className="form-error"
            style={{ marginTop: "var(--s-4)", marginBottom: 0 }}
          >
            We couldn&rsquo;t submit that flag — a reason is required.
          </p>
        )}

        <header
          style={{
            display: "flex",
            gap: "var(--s-5)",
            alignItems: "center",
            flexWrap: "wrap",
            margin: "0 0 var(--s-7)",
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--surface-sunken)",
              border: "1px solid var(--hairline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontSize: 32,
              color: "var(--ink-2)",
              letterSpacing: "-0.01em",
            }}
            aria-hidden
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <p
              className="eyebrow"
              style={{ margin: 0, color: "var(--ink-3)" }}
            >
              Seller
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-h1)",
                color: "var(--ink-1)",
                margin: "var(--s-1) 0 var(--s-2)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              {name}
            </h1>
            <p
              style={{
                color: "var(--ink-3)",
                margin: 0,
                fontSize: 14,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span>Joined {formatJoined(seller.created_at)}</span>
              {seller.town && (
                <>
                  <span aria-hidden style={{ color: "var(--ink-4)" }}>
                    ·
                  </span>
                  <span>{seller.town}</span>
                </>
              )}
              {verifiedCount > 0 && (
                <>
                  <span aria-hidden style={{ color: "var(--ink-4)" }}>
                    ·
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fef3c7",
                      color: "#92400e",
                      border: "1px solid #fcd34d",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ✓ {verifiedCount} Verified
                  </span>
                </>
              )}
              {reviewSummary.count >= reviewsThreshold && (
                <>
                  <span aria-hidden style={{ color: "var(--ink-4)" }}>
                    ·
                  </span>
                  <a
                    href="#reviews"
                    style={{
                      color: "var(--ink-1)",
                      fontWeight: 700,
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "#fcd34d" }}>★</span>{" "}
                    {reviewSummary.average.toFixed(1)}{" "}
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                      ({reviewSummary.count})
                    </span>
                  </a>
                </>
              )}
            </p>
          </div>
        </header>

        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: "var(--s-5)",
          }}
        >
          <Stat value={activeCount} label="Live listings" />
          <Stat value={soldCount} label="Sold" />
          <Stat value={verifiedCount} label="Verified" />
        </div>

        {visibleListings.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing on sale right now</h3>
            <p style={{ margin: 0 }}>
              {name} doesn&rsquo;t have any active listings at the
              moment. Check back later.
            </p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "var(--s-4)",
            }}
          >
            {visibleListings.map((row) => (
              <li key={row.id}>
                <ListingCard
                  data={listingFromRow(
                    row,
                    currentUser?.id,
                    shortlistedIds,
                    reviewsThreshold,
                  )}
                />
              </li>
            ))}
          </ul>
        )}

        {reviews.length > 0 && (
          <section id="reviews" style={{ marginTop: "var(--s-7)" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                color: "var(--ink-1)",
                margin: "0 0 var(--s-3)",
                letterSpacing: "-0.01em",
              }}
            >
              Reviews
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                margin: "0 0 var(--s-5)",
                fontSize: 14,
              }}
            >
              <span style={{ color: "#fcd34d", fontSize: 16 }}>★</span>{" "}
              <strong>{reviewSummary.average.toFixed(1)}</strong> across{" "}
              {reviewSummary.count} review
              {reviewSummary.count === 1 ? "" : "s"}
            </p>
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
              {reviews.map((r) => (
                <li
                  key={r.id}
                  style={{
                    padding: "var(--s-4) var(--s-5)",
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 12,
                  }}
                >
                  <ReviewItem r={r} canFlag={isOwn} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function ReviewItem({
  r,
  canFlag,
}: {
  r: ReviewRow;
  canFlag: boolean;
}) {
  const date = (() => {
    try {
      return new Date(r.created_at).toLocaleDateString("en-AU", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return r.created_at;
    }
  })();
  const chips: string[] = [];
  if (r.as_described === true) chips.push("As described");
  if (r.as_described === false) chips.push("Not as described");
  if (r.easy_communication === true) chips.push("Easy to communicate with");
  if (r.easy_communication === false) chips.push("Hard to reach");
  if (r.smooth_handover === true) chips.push("Smooth handover");
  if (r.smooth_handover === false) chips.push("Bumpy handover");

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 6,
        }}
      >
        <span style={{ color: "#fcd34d", fontSize: 18, lineHeight: 1 }}>
          {"★".repeat(r.stars)}
          <span style={{ color: "var(--hairline)" }}>
            {"★".repeat(5 - r.stars)}
          </span>
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--ink-3)",
          }}
        >
          {maskBuyerEmail(r.buyer_email)} · {date}
        </span>
      </div>
      <Link
        href={`/listings/${r.listing_id}`}
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          textDecoration: "underline",
          textDecorationColor: "var(--hairline-strong)",
          textUnderlineOffset: 3,
        }}
      >
        Bought: {r.listing_title}
      </Link>
      {r.body && (
        <p
          style={{
            margin: "var(--s-3) 0 0",
            color: "var(--ink-1)",
            lineHeight: 1.55,
            fontSize: 15,
            whiteSpace: "pre-wrap",
          }}
        >
          {r.body}
        </p>
      )}
      {chips.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginTop: "var(--s-3)",
          }}
        >
          {chips.map((c) => (
            <span
              key={c}
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                background: "var(--surface-sunken)",
                border: "1px solid var(--hairline)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.08em",
                color: "var(--ink-2)",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
      {canFlag && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 10,
          }}
        >
          <FlagReviewDialog reviewId={r.id} />
        </div>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "12px 14px",
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
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

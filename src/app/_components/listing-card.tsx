import Link from "next/link";
import { ButtonLink, Icon } from "./ui";
import { toggleShortlist } from "@/lib/actions/shortlist";
import { isTrustStatus, type TrustStatus } from "@/lib/listing-trust";
import { TrustBadge } from "./trust-badge";

export type ListingCardStat = {
  value: string;
  label: string;
  /** Public-path icon shown next to the value on the card view. Optional
   *  so the row layout (which doesn't render icons) doesn't have to set it. */
  iconSrc?: string;
};

export type ListingCardData = {
  id: string;
  title: string;
  price: string;
  chips: [string, string, string];
  stats: ListingCardStat[];
  highlights: [string | null, string | null, string | null];
  photo?: string;
  isHidden?: boolean;
  isOwn?: boolean;
  isSold?: boolean;
  isShortlisted?: boolean;
  showShortlist?: boolean;
  interestedCount?: number;
  trustStatus?: TrustStatus;
  /** Seller user id — used to render a 'More from this seller' link
   *  to /sellers/{id} when the viewer isn't the seller themselves. */
  sellerId?: string | null;
  /** Seller rating + count for the ★ 4.8 (12) chip. Card hides it
   *  when count < reviewsDisplayThreshold so a brand-new seller's
   *  missing rating doesn't read as a negative signal. */
  sellerRatingAvg?: number | null;
  sellerRatingCount?: number;
  /** Min reviews required to show the rating chip — sourced from
   *  site_settings.reviews_display_threshold by the consumer page.
   *  Defaults to 3 if unset. */
  reviewsDisplayThreshold?: number;
};

export type ListingCardRow = {
  id: string;
  title: string;
  price_cents: number;
  seller_email: string | null;
  seller_id?: string | null;
  primary_image_id?: string | null;
  designer_name: string | null;
  model: string | null;
  year: number | null;
  condition_label: string | null;
  occasion_label: string | null;
  silhouette_label: string | null;
  fabric_label: string | null;
  size_label: string | null;
  neckline_label: string | null;
  sleeve_style_label: string | null;
  length_label: string | null;
  location_postal: string | null;
  color: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  original_retail_cents: number | null;
  has_original_receipt: boolean | null;
  trust_status?: string | null;
  is_published?: boolean | null;
  sold_at?: string | null;
  conversation_count?: string | number | null;
  /** Seller's average rating (1-5) and count of public reviews —
   *  used to render the ★ 4.8 (12) line on the card. NULL when the
   *  seller has no reviews yet, or when the SELECT didn't fetch them. */
  seller_rating_avg?: string | number | null;
  seller_rating_count?: string | number | null;
};

const PLACEHOLDER = "-";

function buildChips(row: ListingCardRow): [string, string, string] {
  return [
    row.size_label ?? PLACEHOLDER,
    row.silhouette_label ?? PLACEHOLDER,
    row.occasion_label ?? PLACEHOLDER,
  ];
}

function buildStats(row: ListingCardRow): ListingCardStat[] {
  return [
    {
      value: row.size_label ?? PLACEHOLDER,
      label: "Size",
      iconSrc: "/size.png",
    },
    {
      value: row.length_label ?? PLACEHOLDER,
      label: "Length",
      iconSrc: "/length.png",
    },
    {
      value: row.fabric_label ?? PLACEHOLDER,
      label: "Fabric",
      iconSrc: "/fabric.png",
    },
    {
      value: row.condition_label ?? PLACEHOLDER,
      label: "Condition",
      iconSrc: "/condition.png",
    },
  ];
}

function buildHighlights(row: ListingCardRow): [string | null, string | null, string | null] {
  const out: string[] = [];

  if (row.has_original_receipt) out.push("Original receipt included");
  if (row.neckline_label) out.push(`${row.neckline_label} neckline`);
  if (row.sleeve_style_label) out.push(`${row.sleeve_style_label}`);
  if (row.color && out.length < 3) out.push(`${row.color}`);
  if (row.fabric_label && out.length < 3) out.push(`${row.fabric_label} fabric`);
  if (row.original_retail_cents && out.length < 3) {
    const retail = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(row.original_retail_cents / 100);
    out.push(`${retail} original retail`);
  }

  return [out[0] ?? null, out[1] ?? null, out[2] ?? null];
}

export function listingFromRow(
  row: ListingCardRow,
  currentUserId?: string | null,
  shortlistedIds?: Set<string> | null,
  reviewsDisplayThreshold = 3,
): ListingCardData {
  const isOwn =
    currentUserId != null &&
    row.seller_id != null &&
    row.seller_id === currentUserId;
  const isShortlisted =
    shortlistedIds != null && shortlistedIds.has(row.id);
  // Only show the toggle when logged in and not the owner.
  const showShortlist = currentUserId != null && !isOwn;
  const priceFmt = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
  return {
    id: row.id,
    title: row.title,
    price: priceFmt.format(row.price_cents / 100),
    chips: buildChips(row),
    stats: buildStats(row),
    highlights: buildHighlights(row),
    photo: row.primary_image_id
      ? `/api/listings/${row.id}/images/${row.primary_image_id}`
      : undefined,
    isHidden: row.is_published === false,
    isOwn,
    isSold: !!row.sold_at,
    isShortlisted,
    showShortlist,
    interestedCount:
      row.conversation_count != null ? Number(row.conversation_count) : 0,
    trustStatus:
      row.trust_status && isTrustStatus(row.trust_status)
        ? row.trust_status
        : undefined,
    sellerId: row.seller_id ?? null,
    sellerRatingAvg:
      row.seller_rating_avg != null ? Number(row.seller_rating_avg) : null,
    sellerRatingCount:
      row.seller_rating_count != null
        ? Number(row.seller_rating_count)
        : 0,
    reviewsDisplayThreshold,
  };
}

/** Inline ★ 4.8 (12) chip used by both card layouts. Renders nothing
 *  under the threshold (settable from /admin/site-settings) so a new
 *  seller's blank slate doesn't read as a negative signal. */
function SellerRatingPill({
  avg,
  count,
  threshold,
}: {
  avg: number | null | undefined;
  count: number | undefined;
  threshold: number;
}) {
  if (!avg || !count || count < threshold) return null;
  return (
    <span
      style={{
        fontSize: 12,
        color: "var(--ink-2)",
        whiteSpace: "nowrap",
      }}
      title={`${avg.toFixed(1)} from ${count} buyer${count === 1 ? "" : "s"}`}
    >
      <span style={{ color: "#fcd34d" }}>★</span>{" "}
      <strong style={{ color: "var(--ink-1)" }}>{avg.toFixed(1)}</strong>{" "}
      <span style={{ color: "var(--ink-3)" }}>({count})</span>
    </span>
  );
}


function ShortlistButton({
  listingId,
  isShortlisted,
  variant,
}: {
  listingId: string;
  isShortlisted: boolean;
  variant: "card" | "row";
}) {
  return (
    <form action={toggleShortlist} className="shortlist-form">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="next" value={`/listings/${listingId}`} />
      <button
        type="submit"
        className={`shortlist-btn ${variant === "row" ? "is-row" : ""} ${
          isShortlisted ? "is-on" : ""
        }`}
        aria-label={isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
        title={isShortlisted ? "Remove from shortlist" : "Save to shortlist"}
      >
        <Icon name="heart" size="sm" />
      </button>
    </form>
  );
}

export function ListingRow({ data }: { data: ListingCardData }) {
  const detailHref = `/listings/${data.id}`;
  return (
    <article
      className={`listing-row ${data.isHidden ? "is-hidden" : ""} ${data.isOwn ? "is-own" : ""} ${data.isSold ? "is-sold" : ""}`}
    >
      <div className="listing-row-photo">
        {data.photo ? (
          // Row layout renders ~80px wide; 200 covers retina with
          // headroom and replaces the multi-MB iPhone-resolution
          // original that was being shipped per row.
          <img
            src={`${data.photo}?w=200`}
            alt={data.title}
            loading="lazy"
          />
        ) : (
          <span className="listing-row-photo-empty" aria-hidden>
            dress
          </span>
        )}
        {data.isOwn && (
          <span className="listing-row-own-flag" title="Your listing">
            ★
          </span>
        )}
        {data.isHidden && (
          <span className="listing-row-hidden-flag">Hidden</span>
        )}
        {data.trustStatus === "flagged" && (
          <span
            className="listing-row-hidden-flag"
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderColor: "#fca5a5",
            }}
            title="Admin-flagged · hidden from public browse"
          >
            Flagged
          </span>
        )}
        {data.isSold && (
          <span className="listing-row-sold-overlay">Sold</span>
        )}
        {data.showShortlist && !data.isSold && (
          <ShortlistButton
            listingId={data.id}
            isShortlisted={!!data.isShortlisted}
            variant="row"
          />
        )}
      </div>

      <div className="listing-row-info">
        <h3 className="listing-row-title">{data.title}</h3>
        {data.trustStatus && data.trustStatus !== "self-declared" && (
          <div style={{ marginTop: 2 }}>
            <TrustBadge status={data.trustStatus} />
          </div>
        )}
        <div className="listing-row-chips">
          {data.chips.map((c, i) => (
            <span
              key={i}
              className={`listing-chip ${c === PLACEHOLDER ? "is-empty" : ""}`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <dl className="listing-row-stats">
        {data.stats.map((s, i) => (
          <div key={i} className="listing-row-stat">
            <dt>{s.label}</dt>
            <dd className={s.value === PLACEHOLDER ? "is-empty" : ""}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="listing-row-foot">
        <div className="listing-price">{data.price}</div>
        {data.interestedCount && data.interestedCount > 0 ? (
          <span
            className="listing-row-interest"
            title={`${data.interestedCount} interested`}
          >
            💬 {data.interestedCount}
          </span>
        ) : (
          <span
            className="listing-row-interest is-empty"
            title="No buyer comments yet"
          >
            💬 No buyer comments yet
          </span>
        )}
        <ButtonLink
          href={detailHref}
          variant="primary"
          size="sm"
          iconRight="arrow"
        >
          Details
        </ButtonLink>
        {data.sellerId && !data.isOwn && (
          <Link
            href={`/sellers/${data.sellerId}`}
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
              marginLeft: "auto",
            }}
          >
            More from seller →
          </Link>
        )}
        {!data.isOwn && (
          <SellerRatingPill
            avg={data.sellerRatingAvg}
            count={data.sellerRatingCount}
            threshold={data.reviewsDisplayThreshold ?? 3}
          />
        )}
      </div>
    </article>
  );
}

export function ListingCard({ data }: { data: ListingCardData }) {
  const detailHref = `/listings/${data.id}`;
  return (
    <article className="listing">
      <div className="listing-photo">
        <Link
          href={detailHref}
          className="listing-photo-link"
          aria-label={`View ${data.title}`}
        >
          {data.photo ? (
            // Browse-grid card renders at ~280px wide; 800 covers the
            // 2-3x retina case and is a fraction of the original
            // iPhone shot. Sharp converts to WebP server-side.
            <img
              src={`${data.photo}?w=800`}
              alt={data.title}
              loading="lazy"
            />
          ) : (
            <span className="listing-photo-empty">Dress photo</span>
          )}
        </Link>
        <div className="listing-chips">
          {data.chips.map((c, i) => (
            <span
              key={i}
              className={`listing-chip ${c === PLACEHOLDER ? "is-empty" : ""}`}
            >
              {c}
            </span>
          ))}
        </div>
        {data.isOwn && (
          <span className="listing-own-flag" title="Your listing">
            Yours
          </span>
        )}
        {data.isHidden && <span className="listing-hidden-flag">Hidden</span>}
        {data.trustStatus === "flagged" && (
          <span
            className="listing-hidden-flag"
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              borderColor: "#fca5a5",
            }}
            title="Admin-flagged · hidden from public browse"
          >
            Flagged
          </span>
        )}
        {data.isSold && <span className="listing-sold-overlay">Sold</span>}
        {data.showShortlist && !data.isSold && (
          <ShortlistButton
            listingId={data.id}
            isShortlisted={!!data.isShortlisted}
            variant="card"
          />
        )}
      </div>

      <div className="listing-head">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <h3 className="listing-title">{data.title}</h3>
          {data.trustStatus && data.trustStatus !== "self-declared" && (
            <div style={{ flex: "0 0 auto", marginTop: 2 }}>
              <TrustBadge status={data.trustStatus} />
            </div>
          )}
        </div>
      </div>

      <div className="listing-stats">
        {data.stats.map((s, i) => (
          <div key={`${s.label}-${i}`} className="listing-stat">
            {s.iconSrc && (
              <img
                src={s.iconSrc}
                alt=""
                aria-hidden
                className="listing-stat-icon"
                width={22}
                height={22}
              />
            )}
            <span className={`v ${s.value === PLACEHOLDER ? "is-empty" : ""}`}>
              {s.value}
            </span>
            <span className="k">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="listing-body-row">
        <ul className="listing-highlights">
          {data.highlights.map((h, i) => (
            <li key={i} className={h ? "" : "is-empty"} aria-hidden={!h}>
              <Icon name="check" size="sm" />
              <span>{h ?? "—"}</span>
            </li>
          ))}
        </ul>
        <div className="listing-side">
          <div className="listing-price">{data.price}</div>
          {data.interestedCount && data.interestedCount > 0 ? (
            <div className="listing-interest">
              <Icon name="msg" size="sm" />
              <span>
                <strong>{data.interestedCount}</strong>{" "}
                {data.interestedCount === 1 ? "buyer" : "buyers"} interested
              </span>
            </div>
          ) : (
            <div className="listing-interest is-empty">
              <Icon name="msg" size="sm" />
              <span>No comments</span>
            </div>
          )}
        </div>
      </div>

      <div className="listing-foot">
        <ButtonLink
          href={detailHref}
          variant="primary"
          iconRight="arrow"
          className="listing-cta"
          block
        >
          View Details &amp; Photos
        </ButtonLink>
      </div>
      {data.sellerId && !data.isOwn && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/sellers/${data.sellerId}`}
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
            }}
          >
            More from this seller →
          </Link>
          <SellerRatingPill
            avg={data.sellerRatingAvg}
            count={data.sellerRatingCount}
            threshold={data.reviewsDisplayThreshold ?? 3}
          />
        </div>
      )}
    </article>
  );
}

import { ButtonLink, Icon } from "./ui";
import { toggleShortlist } from "@/lib/actions/shortlist";

export type ListingCardStat = {
  value: string;
  label: string;
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
  is_published?: boolean | null;
  sold_at?: string | null;
  conversation_count?: string | number | null;
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
    { value: row.size_label ?? PLACEHOLDER, label: "Size" },
    { value: row.length_label ?? PLACEHOLDER, label: "Length" },
    { value: row.fabric_label ?? PLACEHOLDER, label: "Fabric" },
    { value: row.condition_label ?? PLACEHOLDER, label: "Condition" },
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
  };
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
          <img src={data.photo} alt={data.title} loading="lazy" />
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
      </div>
    </article>
  );
}

export function ListingCard({ data }: { data: ListingCardData }) {
  const detailHref = `/listings/${data.id}`;
  return (
    <article className="listing">
      <div className="listing-head">
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
        <h3 className="listing-title">{data.title}</h3>
      </div>

      <div className="listing-photo">
        {data.photo ? (
          <img src={data.photo} alt={data.title} loading="lazy" />
        ) : (
          <span className="listing-photo-empty">Dress photo</span>
        )}
        {data.isOwn && (
          <span className="listing-own-flag" title="Your listing">
            Yours
          </span>
        )}
        {data.isHidden && <span className="listing-hidden-flag">Hidden</span>}
        {data.isSold && <span className="listing-sold-overlay">Sold</span>}
        {data.showShortlist && !data.isSold && (
          <ShortlistButton
            listingId={data.id}
            isShortlisted={!!data.isShortlisted}
            variant="card"
          />
        )}
      </div>

      <div className="listing-stats">
        {data.stats.map((s, i) => (
          <div key={`${s.label}-${i}`} className="listing-stat">
            <span className={`v ${s.value === PLACEHOLDER ? "is-empty" : ""}`}>
              {s.value}
            </span>
            <span className="k">{s.label}</span>
          </div>
        ))}
      </div>

      <ul className="listing-highlights">
        {data.highlights.map((h, i) => (
          <li key={i} className={h ? "" : "is-empty"} aria-hidden={!h}>
            <Icon name="check" size="sm" />
            <span>{h ?? "—"}</span>
          </li>
        ))}
      </ul>

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
          <span>No buyer comments yet</span>
        </div>
      )}

      <div className="listing-foot">
        <div className="listing-price">{data.price}</div>
        <ButtonLink
          href={detailHref}
          variant="primary"
          iconRight="arrow"
          className="listing-cta"
        >
          View Details &amp; Photos
        </ButtonLink>
      </div>
    </article>
  );
}

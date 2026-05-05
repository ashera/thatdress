import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { getBaseUrl } from "@/lib/email";
import { startConversation } from "@/lib/actions/messages";
import { toggleListingSold } from "@/lib/actions/listings";
import { toggleShortlist } from "@/lib/actions/shortlist";
import { getShortlistIds } from "@/lib/shortlist";
import {
  getListingStats,
  trackListingView,
} from "@/lib/listing-views";
import { isTrustStatus } from "@/lib/listing-trust";
import { setListingTrustStatus } from "@/lib/actions/listing-trust";
import { computeHealth, type HealthInput } from "@/lib/listing-health";
import { loadSiteSettings } from "@/lib/site-settings";
import { TrustBadge } from "../../_components/trust-badge";
import { Button, ButtonLink, Icon } from "../../_components/ui";
import {
  ListingGallery,
  type GalleryImage,
} from "../../_components/listing-gallery";

export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
  seller_email: string | null;
  seller_id: string | null;
  is_published: boolean;
  is_draft: boolean;
  offers_enabled: boolean;
  sold_at: string | null;
  region_id: string | null;
  conversation_count: string;
  // detail fields
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
  alterations_text: string | null;
  has_original_receipt: boolean | null;
  is_authentic_declared: boolean | null;
  includes_label_lining_photos: boolean | null;
  trust_status: string | null;
};

type ImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
};

const LISTING_SELECT = `
  l.id::text,
  l.title,
  l.description,
  l.price_cents,
  l.created_at::text,
  l.seller_id::text,
  l.is_published,
  l.is_draft,
  l.offers_enabled,
  l.sold_at::text,
  l.region_id::text,
  (
    SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
      WHERE listing_id = l.id
  ) AS conversation_count,
  u.email AS seller_email,
  d.name AS designer_name,
  l.model,
  l.year,
  cg.label AS condition_label,
  o.label AS occasion_label,
  s.label AS silhouette_label,
  f.label AS fabric_label,
  ds.label AS size_label,
  n.label AS neckline_label,
  ss.label AS sleeve_style_label,
  dl.label AS length_label,
  l.location_postal,
  l.color,
  l.bust_inches::text,
  l.waist_inches::text,
  l.hips_inches::text,
  l.original_retail_cents,
  l.alterations_text,
  l.has_original_receipt,
  l.is_authentic_declared,
  l.includes_label_lining_photos,
  l.trust_status
`;

const LISTING_JOINS = `
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
`;

// React.cache dedupes the DB hit between generateMetadata and the
// default export within a single request — both call this with the
// same id, so the second call returns the cached promise.
const fetchListing = cache(async (
  id: string,
): Promise<
  | { ok: true; listing: ListingRow | null; images: GalleryImage[] }
  | { ok: false; error: string }
> => {
  if (!/^\d+$/.test(id)) return { ok: true, listing: null, images: [] };
  try {
    const result = await query<ListingRow>(
      `SELECT ${LISTING_SELECT}
         FROM listings l
         ${LISTING_JOINS}
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    const listing = result.rows[0] ?? null;
    if (!listing) return { ok: true, listing: null, images: [] };

    const imgRes = await query<ImageRow>(
      `SELECT id::text, is_primary, position
         FROM listing_images
        WHERE listing_id = $1::bigint
        ORDER BY is_primary DESC, position, id`,
      [id],
    );
    const images: GalleryImage[] = imgRes.rows.map((r) => ({
      id: r.id,
      src: `/api/listings/${id}/images/${r.id}`,
      isPrimary: r.is_primary,
    }));
    return { ok: true, listing, images };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
});

function priceFormat(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/**
 * Map our condition slugs to schema.org's enum. We only use
 * NewCondition for tagged-as-new; everything else is UsedCondition
 * since the marketplace is pre-loved.
 */
function schemaCondition(condition_label: string | null): string {
  if (!condition_label) return "https://schema.org/UsedCondition";
  const lc = condition_label.toLowerCase();
  if (lc.includes("new with tags")) return "https://schema.org/NewCondition";
  return "https://schema.org/UsedCondition";
}

function buildListingDescription(l: ListingRow): string {
  if (l.description) {
    const trimmed = l.description.replace(/\s+/g, " ").trim();
    return trimmed.length <= 160 ? trimmed : `${trimmed.slice(0, 157)}…`;
  }
  // Fall back to a spec line built from the structured fields.
  const parts: string[] = [];
  if (l.condition_label) parts.push(l.condition_label.toLowerCase());
  if (l.silhouette_label) parts.push(l.silhouette_label.toLowerCase());
  if (l.color) parts.push(l.color.toLowerCase());
  if (l.designer_name) parts.push(`by ${l.designer_name}`);
  if (l.size_label) parts.push(`size ${l.size_label}`);
  const opening = parts.length ? `Pre-loved ${parts.join(" ")}` : "Pre-loved formal dress";
  return `${opening}. Available on frockd, the peer-to-peer formal-dress marketplace.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchListing(id);
  if (!result.ok || !result.listing) {
    return { title: "Listing not found" };
  }
  const l = result.listing;
  // Hide unpublished/draft listings from search engines too.
  if (l.is_draft || !l.is_published) {
    return {
      title: l.title,
      robots: { index: false, follow: false },
    };
  }

  const description = buildListingDescription(l);
  const titleSegments = [l.title];
  if (l.size_label) titleSegments.push(`size ${l.size_label}`);
  titleSegments.push(priceFormat(l.price_cents));
  const title = titleSegments.join(" · ");

  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/listings/${l.id}`;
  // Note: og:image / twitter:image come from opengraph-image.tsx and
  // twitter-image.tsx in this folder — Next.js wires them automatically,
  // so we deliberately don't set images here (would stack two cards).
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "frockd",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function initials(email?: string | null): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function formatPostedDate(s: string): string {
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

function fmtMeasure(s: string | null): string | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return `${n}″`;
}

type Spec = { k: string; v: string };

function buildSpecs(l: ListingRow): { group: string; items: Spec[] }[] {
  const overview: Spec[] = [];
  if (l.designer_name) overview.push({ k: "Designer", v: l.designer_name });
  if (l.model) overview.push({ k: "Style", v: l.model });
  if (l.year) overview.push({ k: "Year", v: String(l.year) });
  if (l.condition_label) overview.push({ k: "Condition", v: l.condition_label });
  if (l.occasion_label) overview.push({ k: "Occasion", v: l.occasion_label });
  if (l.location_postal)
    overview.push({ k: "Location", v: l.location_postal });

  const style: Spec[] = [];
  if (l.silhouette_label) style.push({ k: "Silhouette", v: l.silhouette_label });
  if (l.length_label) style.push({ k: "Length", v: l.length_label });
  if (l.fabric_label) style.push({ k: "Fabric", v: l.fabric_label });
  if (l.color) style.push({ k: "Color", v: l.color });
  if (l.neckline_label) style.push({ k: "Neckline", v: l.neckline_label });
  if (l.sleeve_style_label) style.push({ k: "Sleeve", v: l.sleeve_style_label });

  const fit: Spec[] = [];
  if (l.size_label) fit.push({ k: "Labelled size", v: l.size_label });
  const bust = fmtMeasure(l.bust_inches);
  if (bust) fit.push({ k: "Bust", v: bust });
  const waist = fmtMeasure(l.waist_inches);
  if (waist) fit.push({ k: "Waist", v: waist });
  const hips = fmtMeasure(l.hips_inches);
  if (hips) fit.push({ k: "Hips", v: hips });

  const provenance: Spec[] = [];
  if (l.original_retail_cents != null && l.original_retail_cents > 0) {
    const retail = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(l.original_retail_cents / 100);
    provenance.push({ k: "Original retail", v: retail });
  }
  if (l.has_original_receipt)
    provenance.push({ k: "Original receipt", v: "Yes" });

  const groups = [
    { group: "Overview", items: overview },
    { group: "Style", items: style },
    { group: "Size & fit", items: fit },
    { group: "Provenance", items: provenance },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Coerce a ListingRow into the HealthInput shape. We only have the
 *  joined *_label fields on the detail page (not the raw *_id columns),
 *  but presence-of-label is a reliable proxy for presence-of-id, which
 *  is all the health calc needs. */
function rowToHealthInput(l: ListingRow, imageCount: number): HealthInput {
  function num(s: string | null | undefined): number | null {
    if (s == null || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const present = (s: string | null | undefined) => (s ? "x" : null);
  return {
    designerId: present(l.designer_name),
    model: l.model,
    year: l.year,
    occasionId: present(l.occasion_label),
    conditionId: present(l.condition_label),
    sizeId: present(l.size_label),
    silhouetteId: present(l.silhouette_label),
    fabricId: present(l.fabric_label),
    necklineId: present(l.neckline_label),
    sleeveStyleId: present(l.sleeve_style_label),
    lengthId: present(l.length_label),
    color: l.color,
    bustInches: num(l.bust_inches),
    waistInches: num(l.waist_inches),
    hipsInches: num(l.hips_inches),
    originalRetailCents: l.original_retail_cents,
    hasOriginalReceipt: !!l.has_original_receipt,
    isAuthenticDeclared: !!l.is_authentic_declared,
    includesLabelLiningPhotos: !!l.includes_label_lining_photos,
    description: l.description,
    imageCount,
  };
}

/** Compressed listing-health card shown on the detail page when the
 *  viewer owns the listing (or is an admin). Mirrors the wizard's
 *  HealthBar but with smaller numerals and only the top suggestion,
 *  so it acts as a quick "here's what's still keeping you off the
 *  Verified badge" hint without the full breakdown. Each suggestion
 *  link jumps to the relevant wizard step. */
async function OwnerHealthCard({
  listing,
  imageCount,
}: {
  listing: ListingRow;
  imageCount: number;
}) {
  const settings = await loadSiteSettings();
  const verifiedThreshold = settings.healthThresholdVerified;
  const { score, suggestions } = computeHealth(
    rowToHealthInput(listing, imageCount),
  );
  const meetsVerified = score >= verifiedThreshold;
  const top = suggestions.slice(0, 1);
  return (
    <div
      style={{
        margin: "var(--s-3) 0",
        padding: "10px 14px",
        background: meetsVerified
          ? "var(--volt-50)"
          : "var(--surface-sunken)",
        border: `1px solid ${
          meetsVerified ? "var(--volt-200)" : "var(--hairline)"
        }`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Listing health
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            color: "var(--ink-1)",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {score}
          <span
            style={{
              color: "var(--ink-4)",
              fontSize: 12,
              fontWeight: 400,
            }}
          >
            {" / 100"}
          </span>
        </div>
        {meetsVerified ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#92400e",
              fontWeight: 700,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            ✓ Verified-eligible
          </span>
        ) : (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            {verifiedThreshold - score} pts to Verified
          </span>
        )}
        <Link
          href={`/listings/${listing.id}/edit`}
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-2)",
            textDecoration: "underline",
            textDecorationColor: "var(--hairline-strong)",
            textUnderlineOffset: 3,
          }}
        >
          Edit →
        </Link>
      </div>

      <div
        style={{
          height: 4,
          background: "var(--hairline)",
          borderRadius: 999,
          marginTop: 8,
          overflow: "hidden",
        }}
        aria-hidden
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: meetsVerified ? "#fcd34d" : "var(--ink-2)",
            transition: "width 200ms",
          }}
        />
      </div>

      {top.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--ink-2)",
            display: "flex",
            gap: 6,
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#92400e",
              fontWeight: 700,
            }}
          >
            +{top[0]!.points}
          </span>
          <Link
            href={`/listings/new/${listing.id}/${top[0]!.step}`}
            style={{
              color: "var(--ink-1)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
            }}
          >
            {top[0]!.text}
          </Link>
        </div>
      )}
    </div>
  );
}

type ConversationSummary = {
  id: string;
  buyer_email: string | null;
  msg_count: string;
  last_at: string | null;
};

type OfferRow = {
  id: string;
  buyer_id: string;
  buyer_email: string | null;
  amount_cents: number;
  note: string | null;
  status: string;
  created_at: string;
  conversation_id: string | null;
};

async function fetchOffersForListing(
  listingId: string,
): Promise<OfferRow[]> {
  try {
    const r = await query<OfferRow>(
      `SELECT o.id::text,
              o.buyer_id::text,
              u.email AS buyer_email,
              o.amount_cents,
              o.note,
              o.status,
              o.created_at::text,
              (
                SELECT c.id::text FROM conversations c
                  WHERE c.listing_id = o.listing_id
                    AND c.buyer_id = o.buyer_id
                  LIMIT 1
              ) AS conversation_id
         FROM offers o
         LEFT JOIN users u ON u.id = o.buyer_id
        WHERE o.listing_id = $1::bigint
        ORDER BY o.created_at DESC`,
      [listingId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function fetchConversationsForListing(
  listingId: string,
): Promise<ConversationSummary[]> {
  try {
    const r = await query<ConversationSummary>(
      `SELECT c.id::text,
              bu.email AS buyer_email,
              (
                SELECT COUNT(*)::text FROM messages
                  WHERE conversation_id = c.id
              ) AS msg_count,
              (
                SELECT created_at::text FROM messages
                  WHERE conversation_id = c.id
                  ORDER BY created_at DESC LIMIT 1
              ) AS last_at
         FROM conversations c
         LEFT JOIN users bu ON bu.id = c.buyer_id
        WHERE c.listing_id = $1::bigint
        ORDER BY c.updated_at DESC`,
      [listingId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, currentUser, regionId] = await Promise.all([
    fetchListing(id),
    getCurrentUser(),
    getCurrentRegionId(),
  ]);
  const shortlistedIds = await getShortlistIds(currentUser?.id);

  if (!result.ok) {
    return (
      <div className="page detail-page">
        <Link href="/listings" className="back-link">
          ← Back to browse
        </Link>
        <div className="form-error">
          <strong>Could not load listing.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      </div>
    );
  }

  if (!result.listing) notFound();

  const l = result.listing;
  const isOwner = currentUser != null && currentUser.id === l.seller_id;
  const isAdmin = currentUser?.isAdmin ?? false;
  if (l.is_draft) {
    if (isOwner) redirect(`/listings/new/${l.id}/photos`);
    notFound();
  }
  if (!l.is_published && !isOwner && !isAdmin) notFound();
  // Hide listings outside the viewer's region (unless they own it or are admin).
  if (
    l.region_id &&
    regionId &&
    l.region_id !== regionId &&
    !isOwner &&
    !isAdmin
  ) {
    notFound();
  }
  const price = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(l.price_cents / 100);
  const sellerName = l.seller_email
    ? (l.seller_email.split("@")[0] ?? l.seller_email)
    : "Unknown seller";

  const specGroups = buildSpecs(l);
  const adminConversations = isAdmin
    ? await fetchConversationsForListing(l.id)
    : [];
  const offers = (isOwner || isAdmin) && l.offers_enabled
    ? await fetchOffersForListing(l.id)
    : [];

  // Side effect: count this view (skipped for the seller). Failures are
  // swallowed inside the helper so they never block render.
  await trackListingView({
    listingId: l.id,
    viewerId: currentUser?.id ?? null,
    sellerId: l.seller_id,
  });

  const stats = (isOwner || isAdmin)
    ? await getListingStats(l.id)
    : null;

  // Product structured data — only emit for live, available listings so
  // we don't tell Google a sold/draft listing is in stock.
  const baseUrl = await getBaseUrl();
  const productUrl = `${baseUrl}/listings/${l.id}`;
  const primaryImageId = result.images[0]?.id ?? null;
  const productImageUrl = primaryImageId
    ? `${baseUrl}/api/listings/${l.id}/images/${primaryImageId}`
    : undefined;
  const showProductSchema = l.is_published && !l.is_draft;
  const breadcrumbSchema = showProductSchema
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${baseUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Browse",
            item: `${baseUrl}/listings`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: l.title,
          },
        ],
      }
    : null;
  const productSchema = showProductSchema
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: l.title,
        description: buildListingDescription(l),
        ...(productImageUrl ? { image: productImageUrl } : {}),
        ...(l.designer_name
          ? { brand: { "@type": "Brand", name: l.designer_name } }
          : {}),
        ...(l.color ? { color: l.color } : {}),
        ...(l.size_label ? { size: l.size_label } : {}),
        ...(l.occasion_label ? { category: l.occasion_label } : {}),
        offers: {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "AUD",
          price: (l.price_cents / 100).toFixed(2),
          availability: l.sold_at
            ? "https://schema.org/SoldOut"
            : "https://schema.org/InStock",
          itemCondition: schemaCondition(l.condition_label),
        },
      }
    : null;

  return (
    <div className="page detail-page">
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      {productSchema && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      )}
      <Link href="/listings" className="back-link">
        ← Back to browse
      </Link>

      {l.sold_at && (
        <div className="sold-banner">
          <strong>Sold.</strong>
          <span>
            This listing is no longer available
            {isOwner ? " — you marked it sold." : "."}
          </span>
          {(isOwner || isAdmin) && (
            <form action={toggleListingSold}>
              <input type="hidden" name="listingId" value={l.id} />
              <Button type="submit" variant="ghost" size="sm">
                Mark available
              </Button>
            </form>
          )}
        </div>
      )}

      {!l.is_published && (isOwner || isAdmin) && (
        <div className="hidden-banner">
          <strong>Hidden from browse.</strong>
          <span>
            {isOwner
              ? "Only you can see this listing."
              : "Visible to admins only."}{" "}
            {isOwner && (
              <>
                Toggle visibility on the{" "}
                <Link href={`/listings/${l.id}/edit`}>edit page</Link>.
              </>
            )}
          </span>
        </div>
      )}

      <article className="detail">
        <ListingGallery images={result.images} title={l.title} />

        <div className="detail-body">
          <p className="eyebrow">
            {[l.designer_name, l.occasion_label].filter(Boolean).join(" · ") ||
              "Pre-loved dress"}
          </p>
          <h1 className="detail-title">{l.title}</h1>
          {(() => {
            const ts =
              l.trust_status && isTrustStatus(l.trust_status)
                ? l.trust_status
                : undefined;
            if (!ts) return null;
            return (
              <div style={{ margin: "var(--s-3) 0" }}>
                <TrustBadge status={ts} size="large" />
              </div>
            );
          })()}
          {(isOwner || isAdmin) && (
            <OwnerHealthCard
              listing={l}
              imageCount={result.images.length}
            />
          )}
          <div className="detail-price">{price}</div>

          <div className="detail-seller">
            <span className="avatar">{initials(l.seller_email)}</span>
            <div>
              <div className="who">{sellerName}</div>
              <div className="when">
                Posted {formatPostedDate(l.created_at)}
                {l.location_postal ? ` · ${l.location_postal}` : ""}
              </div>
            </div>
          </div>

          {(() => {
            const interested = Number(l.conversation_count ?? 0);
            if (interested === 0) return null;
            const noun = interested === 1 ? "buyer has" : "buyers have";
            return (
              <p className="detail-interest">
                <strong>{interested}</strong>{" "}
                {isOwner ? (
                  <>
                    {noun} messaged you about this listing.{" "}
                    <Link href="/messages">Open inbox →</Link>
                  </>
                ) : (
                  <>{noun} asked the seller about this dress.</>
                )}
              </p>
            );
          })()}

          {l.description ? (
            <p className="detail-desc">{l.description}</p>
          ) : (
            <p className="detail-desc detail-desc--empty">
              No description provided.
            </p>
          )}

          <div className="detail-actions">
            {!l.sold_at && !isOwner && l.seller_id && currentUser ? (
              <form action={startConversation}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  iconRight="msg"
                >
                  Contact seller
                </Button>
              </form>
            ) : !l.sold_at && !isOwner && l.seller_id ? (
              <ButtonLink
                href={`/login?next=${encodeURIComponent(`/listings/${l.id}`)}`}
                variant="primary"
                size="lg"
                iconRight="arrow"
              >
                Log in to contact seller
              </ButtonLink>
            ) : null}
            {!l.sold_at && !isOwner && l.seller_id && l.offers_enabled && (
              <ButtonLink
                href={
                  currentUser
                    ? `/listings/${l.id}/offer`
                    : `/login?next=${encodeURIComponent(`/listings/${l.id}/offer`)}`
                }
                variant="dark"
                size="lg"
              >
                Make an offer
              </ButtonLink>
            )}
            {!l.sold_at && (isOwner || isAdmin) && (
              <form action={toggleListingSold}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button type="submit" variant="dark" size="lg">
                  Mark as sold
                </Button>
              </form>
            )}
            {!l.sold_at && !isOwner && currentUser && (
              <form action={toggleShortlist}>
                <input type="hidden" name="listingId" value={l.id} />
                <input
                  type="hidden"
                  name="next"
                  value={`/listings/${l.id}`}
                />
                <Button
                  type="submit"
                  variant={shortlistedIds.has(l.id) ? "primary" : "ghost"}
                  size="lg"
                >
                  <Icon name="heart" size="sm" />
                  {shortlistedIds.has(l.id) ? "Saved" : "Save"}
                </Button>
              </form>
            )}
            <ButtonLink href="/listings" variant="ghost" size="lg">
              See more dresses
            </ButtonLink>
            {(isOwner || isAdmin) && (
              <ButtonLink
                href={`/listings/${l.id}/edit`}
                variant="quiet"
                size="lg"
              >
                {isOwner ? "Edit listing" : "Edit (admin)"}
              </ButtonLink>
            )}
            {isAdmin && (
              <form action={setListingTrustStatus}>
                <input type="hidden" name="listingId" value={l.id} />
                {l.trust_status === "flagged" ? (
                  <>
                    <input
                      type="hidden"
                      name="status"
                      value="self-declared"
                    />
                    <Button type="submit" variant="quiet" size="lg">
                      Restore (un-flag)
                    </Button>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="status" value="flagged" />
                    <Button type="submit" variant="quiet" size="lg">
                      Flag for review
                    </Button>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      </article>

      {specGroups.length > 0 && (
        <section className="detail-specs">
          <h2 className="detail-specs-heading">Details</h2>
          <div className="detail-specs-grid">
            {specGroups.map((g) => (
              <div key={g.group} className="detail-specs-group">
                <h3>{g.group}</h3>
                <dl>
                  {g.items.map((s) => (
                    <div key={s.k} className="detail-spec-row">
                      <dt>{s.k}</dt>
                      <dd>{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {l.alterations_text && (
            <div className="detail-notes">
              <div>
                <h4>Alterations &amp; tailoring</h4>
                <p>{l.alterations_text}</p>
              </div>
            </div>
          )}
        </section>
      )}

      {stats && (
        <section className="listing-stats-panel">
          <h2 className="detail-specs-heading">Stats</h2>
          <div className="listing-stats-grid">
            <div>
              <div className="listing-stats-value">{stats.total}</div>
              <div className="listing-stats-label">Total views</div>
            </div>
            <div>
              <div className="listing-stats-value">{stats.last7}</div>
              <div className="listing-stats-label">Last 7 days</div>
            </div>
            <div>
              <div className="listing-stats-value">{stats.uniqueViewers}</div>
              <div className="listing-stats-label">Unique viewers</div>
            </div>
            <div>
              <div className="listing-stats-value">
                {Number(l.conversation_count ?? 0)}
              </div>
              <div className="listing-stats-label">Buyer conversations</div>
            </div>
          </div>
        </section>
      )}

      {(isOwner || isAdmin) && l.offers_enabled && (
        <section className="admin-conversations">
          <h2 className="detail-specs-heading">
            Offers received{" "}
            <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
              ({offers.length})
            </span>
          </h2>
          {offers.length === 0 ? (
            <p style={{ color: "var(--ink-3)", margin: 0 }}>
              No offers yet. Buyers will appear here when they propose a
              price.
            </p>
          ) : (
            <ul className="admin-conv-list">
              {offers.map((o) => {
                const amount = new Intl.NumberFormat("en-AU", {
                  style: "currency",
                  currency: "AUD",
                  maximumFractionDigits: 0,
                }).format(o.amount_cents / 100);
                const when = new Date(o.created_at).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" },
                );
                const inner = (
                  <>
                    <span className="admin-conv-buyer">
                      <strong>{amount}</strong>
                      {" — "}
                      {o.buyer_email ?? "Unknown buyer"}
                    </span>
                    <span className="admin-conv-meta">
                      {when}
                      {o.note ? ` · "${o.note.slice(0, 80)}"` : ""}
                    </span>
                    <span className="admin-conv-arrow" aria-hidden>
                      →
                    </span>
                  </>
                );
                return (
                  <li key={o.id}>
                    {o.conversation_id ? (
                      <Link
                        href={`/messages/${o.conversation_id}`}
                        className="admin-conv-item"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="admin-conv-item">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="admin-conversations">
          <h2 className="detail-specs-heading">
            Conversations{" "}
            <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
              ({adminConversations.length})
            </span>
          </h2>
          {adminConversations.length === 0 ? (
            <p style={{ color: "var(--ink-3)", margin: 0 }}>
              No conversations on this listing yet.
            </p>
          ) : (
            <ul className="admin-conv-list">
              {adminConversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/messages/${c.id}`}
                    className="admin-conv-item"
                  >
                    <span className="admin-conv-buyer">
                      {c.buyer_email ?? "Unknown buyer"}
                    </span>
                    <span className="admin-conv-meta">
                      {c.msg_count} message
                      {Number(c.msg_count) === 1 ? "" : "s"}
                      {c.last_at
                        ? ` · last ${new Date(c.last_at).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" },
                          )}`
                        : ""}
                    </span>
                    <span className="admin-conv-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

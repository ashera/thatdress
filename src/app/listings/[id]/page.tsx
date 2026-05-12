import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { getBaseUrl } from "@/lib/email";
import { startConversation } from "@/lib/actions/messages";
import {
  toggleListingFeatured,
  toggleListingSold,
  toggleListingVisibility,
} from "@/lib/actions/listings";
import { toggleShortlist } from "@/lib/actions/shortlist";
import { getShortlistIds } from "@/lib/shortlist";
import {
  getListingStats,
  trackListingView,
} from "@/lib/listing-views";
import { deriveTrustStatus, isTrustStatus } from "@/lib/listing-trust";
import { setListingTrustStatus } from "@/lib/actions/listing-trust";
import { computeHealth, type HealthInput } from "@/lib/listing-health";
import { assessFit, fitPalette } from "@/lib/fit";
import { loadSiteSettings } from "@/lib/site-settings";
import { TrustBadge } from "../../_components/trust-badge";
import { FlagListingDialog } from "../../_components/flag-listing-dialog";
import { ReportListingDialog } from "../../_components/report-listing-dialog";
import { ShareListingButton } from "../../_components/share-listing-button";
import { MarkSoldDialog } from "../../_components/mark-sold-dialog";
import { getSellerReviewSummary } from "@/lib/reviews";
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
  dress_id: string;
  is_featured: boolean;
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
  l.dress_id::text,
  l.is_featured,
  (
    SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
      WHERE listing_id = l.id
  ) AS conversation_count,
  u.email AS seller_email,
  d.name AS designer_name,
  dr.model AS model,
  dr.year AS year,
  cg.label AS condition_label,
  o.label AS occasion_label,
  s.label AS silhouette_label,
  f.label AS fabric_label,
  ds.label AS size_label,
  n.label AS neckline_label,
  ss.label AS sleeve_style_label,
  dl.label AS length_label,
  l.location_postal,
  dr.color AS color,
  dr.bust_inches::text  AS bust_inches,
  dr.waist_inches::text AS waist_inches,
  dr.hips_inches::text  AS hips_inches,
  dr.original_retail_cents AS original_retail_cents,
  l.alterations_text,
  l.has_original_receipt,
  l.is_authentic_declared,
  l.includes_label_lining_photos,
  l.trust_status
`;

const LISTING_JOINS = `
  JOIN dresses dr  ON dr.id = l.dress_id
  LEFT JOIN users            u   ON u.id   = l.seller_id
  LEFT JOIN designers        d   ON d.id   = dr.designer_id
  LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
  LEFT JOIN occasions        o   ON o.id   = l.occasion_id
  LEFT JOIN silhouettes      s   ON s.id   = dr.silhouette_id
  LEFT JOIN fabrics          f   ON f.id   = dr.fabric_id
  LEFT JOIN dress_sizes      ds  ON ds.id  = dr.size_id
  LEFT JOIN necklines        n   ON n.id   = dr.neckline_id
  LEFT JOIN sleeve_styles    ss  ON ss.id  = dr.sleeve_style_id
  LEFT JOIN dress_lengths    dl  ON dl.id  = dr.length_id
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

type Provenance = {
  prior_sales: number;
  first_listed_at: string | null;
  last_sold_at: string | null;
};

/**
 * Phase 5 provenance — count + dates of prior sales for the dress.
 * Excludes 'sold-elsewhere' events since those don't represent a
 * verified prior on-platform owner. Excludes the current listing's
 * own sale (which doesn't exist yet at view time anyway). Returns
 * null when the dress has never been sold on the platform — caller
 * hides the section so first-time-listed dresses don't show empty
 * "no history" copy.
 */
async function fetchProvenance(
  dressId: string,
): Promise<Provenance | null> {
  if (!/^\d+$/.test(dressId)) return null;
  try {
    const r = await query<{
      prior_sales: string;
      first_listed_at: string | null;
      last_sold_at: string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'sold')::text AS prior_sales,
         MIN(occurred_at) FILTER (WHERE event_type = 'created')::text
           AS first_listed_at,
         MAX(occurred_at) FILTER (WHERE event_type = 'sold')::text
           AS last_sold_at
       FROM dress_ownership_events
       WHERE dress_id = $1::bigint`,
      [dressId],
    );
    const row = r.rows[0];
    if (!row) return null;
    const priorSales = Number(row.prior_sales ?? 0);
    if (priorSales < 1) return null;
    return {
      prior_sales: priorSales,
      first_listed_at: row.first_listed_at,
      last_sold_at: row.last_sold_at,
    };
  } catch {
    return null;
  }
}

function formatMonthYear(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

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
  const healthInput = rowToHealthInput(listing, imageCount);
  const { score, suggestions } = computeHealth(healthInput);

  // The score alone doesn't qualify a listing for the Verified badge —
  // it also needs the seller's authenticity declaration, both
  // label/lining photos, and at least 3 photos total. Build the
  // status text from the *actual* gating conditions so the strip
  // can't say "Verified-eligible" while the badge stays absent.
  const scoreOk = score >= verifiedThreshold;
  const photosOk = healthInput.imageCount >= 3;
  const labelLiningOk = healthInput.includesLabelLiningPhotos;
  const authenticityOk = healthInput.isAuthenticDeclared;
  const eligible = scoreOk && photosOk && labelLiningOk && authenticityOk;

  let statusText: string;
  if (eligible) {
    statusText = "✓ Verified-eligible";
  } else if (!scoreOk) {
    statusText = `${verifiedThreshold - score} pts to Verified`;
  } else if (!authenticityOk) {
    statusText = "Confirm authenticity at publish";
  } else if (!labelLiningOk) {
    statusText = "Add label + lining photos";
  } else if (!photosOk) {
    statusText = `Add ${3 - healthInput.imageCount} more photo${3 - healthInput.imageCount === 1 ? "" : "s"}`;
  } else {
    statusText = "Verified-eligible";
  }

  const top = suggestions.slice(0, 1);
  // Visual treatment: only flip to gold when all gates are green so
  // the strip's colour matches the trust badge state.
  const meetsVerified = eligible;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        margin: "var(--s-2) 0 var(--s-3)",
        padding: "6px 10px",
        background: meetsVerified
          ? "var(--volt-50)"
          : "var(--surface-sunken)",
        border: `1px solid ${
          meetsVerified ? "var(--volt-200)" : "var(--hairline)"
        }`,
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        Health
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--ink-1)",
        }}
      >
        {score}
        <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>/100</span>
      </span>
      <div
        style={{
          flex: "1 1 80px",
          minWidth: 60,
          height: 4,
          background: "var(--hairline)",
          borderRadius: 999,
          overflow: "hidden",
        }}
        aria-hidden
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: meetsVerified ? "#fcd34d" : "var(--ink-2)",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: eligible ? "#92400e" : "var(--ink-3)",
          fontWeight: eligible ? 700 : 400,
        }}
      >
        {statusText}
      </span>
      {top.length > 0 && (
        <Link
          href={`/listings/new/${listing.id}/${top[0]!.step}`}
          style={{
            fontSize: 12,
            color: "var(--ink-2)",
            textDecoration: "underline",
            textDecorationColor: "var(--hairline-strong)",
            textUnderlineOffset: 3,
          }}
        >
          +{top[0]!.points} {top[0]!.text}
        </Link>
      )}
    </div>
  );
}

type ConversationSummary = {
  id: string;
  buyer_id: string | null;
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
              c.buyer_id::text AS buyer_id,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    reported?: string;
    unmark?: string;
    other?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const reportedFlag = sp.reported ?? null;
  const unmarkError = sp.unmark ?? null;
  const unmarkOtherListingId = sp.other ?? null;
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
    if (isOwner || isAdmin) redirect(`/listings/new/${l.id}/basics`);
    notFound();
  }
  if (!l.is_published && !isOwner && !isAdmin) notFound();
  // Flagged listings are hidden from non-owner / non-admin visitors —
  // they shouldn't be reachable from buyer browse or via direct URL.
  // Owner still sees it (so they know it's under review) and admin
  // sees it from the moderation queue.
  if (l.trust_status === "flagged" && !isOwner && !isAdmin) notFound();
  // Out-of-region listings used to 404, but that broke the new
  // seller-profile drill-through (a seller selling in multiple
  // regions has listings the buyer's region filter would otherwise
  // hide). Now we let the page render — the region info is shown
  // via location_postal in the seller block, and the buyer can
  // decide whether pickup / shipping works for them. Browse + the
  // homepage still filter by region; direct links don't.
  const isOutOfRegion =
    !!(l.region_id && regionId && l.region_id !== regionId) &&
    !isOwner &&
    !isAdmin;

  // Self-heal trust_status: re-derive from the live row data and write
  // back if it doesn't match the stored value. Catches listings that
  // existed before recompute was wired into the wizard, or any future
  // path that mutates a relevant field without recomputing. Cost is
  // one UPDATE *only when something actually drifted* — the read is
  // free, we already have everything from fetchListing.
  {
    const settingsForTrust = await loadSiteSettings();
    const currentTrust =
      l.trust_status && isTrustStatus(l.trust_status)
        ? l.trust_status
        : "self-declared";
    const derivedTrust = deriveTrustStatus({
      current: currentTrust,
      health: rowToHealthInput(l, result.images.length),
      threshold: settingsForTrust.healthThresholdVerified,
    });
    if (derivedTrust !== currentTrust) {
      await query(
        `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
        [derivedTrust, l.id],
      );
      l.trust_status = derivedTrust;
    }
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
  // Fit calculator: surface how the dress fits the current viewer.
  // Three states for non-owner buyers:
  //  - 'assessed' — user has measurements + at least one overlaps a
  //                 dress measurement → real per-axis assessment.
  //  - 'cta'      — user has no measurements yet → empty card with a
  //                 'set your measurements' link.
  //  - hidden     — user has measurements but dress has none, or
  //                 viewer is the seller/admin on their own listing.
  const userHasMeasurements = !!(
    currentUser &&
    (currentUser.bustInches != null ||
      currentUser.waistInches != null ||
      currentUser.hipsInches != null)
  );
  const fit =
    currentUser && !isOwner && userHasMeasurements
      ? assessFit(
          {
            bust: currentUser.bustInches,
            waist: currentUser.waistInches,
            hips: currentUser.hipsInches,
          },
          {
            bust: l.bust_inches,
            waist: l.waist_inches,
            hips: l.hips_inches,
          },
        )
      : null;
  // Show the empty-state card to a signed-in non-owner buyer who
  // hasn't entered measurements yet — encourages profile completion
  // and primes them to come back with a fit assessment.
  const showFitCta = !!(currentUser && !isOwner && !userHasMeasurements);
  // Seller's review summary — surfaced inline in the seller block
  // once the count crosses the admin-configured threshold.
  const [sellerReviewSummary, pageSettings, provenance] = await Promise.all([
    l.seller_id
      ? getSellerReviewSummary(l.seller_id)
      : Promise.resolve({ count: 0, average: 0 }),
    loadSiteSettings(),
    fetchProvenance(l.dress_id),
  ]);
  const reviewsThreshold = pageSettings.reviewsDisplayThreshold;

  // Owners + admins both need this — owners use it for the
  // mark-sold buyer-picker, admins for their inline conversation list.
  const conversationsForListing =
    isOwner || isAdmin ? await fetchConversationsForListing(l.id) : [];
  const adminConversations = isAdmin ? conversationsForListing : [];
  const buyerOptions = (isOwner || isAdmin)
    ? conversationsForListing
        .filter((c) => c.buyer_id && c.buyer_email)
        .map((c) => ({
          id: c.buyer_id!,
          email: c.buyer_email!,
          messageCount: Number(c.msg_count ?? 0),
        }))
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
            href="/admin/listings"
            className="back-link"
            style={{ color: "var(--ink-2)" }}
          >
            ← Admin: all listings
          </Link>
        )}
      </div>

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

      {reportedFlag === "1" && (
        <div
          style={{
            margin: "var(--s-3) 0",
            padding: "10px 14px",
            background: "var(--volt-50)",
            border: "1px solid var(--volt-200)",
            borderRadius: 10,
            color: "var(--ink-1)",
            fontSize: 14,
          }}
        >
          <strong>Thanks for the report.</strong> The frockd team will
          review it.
        </div>
      )}
      {reportedFlag === "duplicate" && (
        <div
          style={{
            margin: "var(--s-3) 0",
            padding: "10px 14px",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            color: "var(--ink-2)",
            fontSize: 14,
          }}
        >
          You&rsquo;ve already reported this listing — your earlier
          report is still open.
        </div>
      )}
      {unmarkError === "not-owner" && (
        <div
          style={{
            margin: "var(--s-3) 0",
            padding: "10px 14px",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 10,
            color: "#78350f",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Can&rsquo;t reactivate.</strong>
          {" "}This dress has been sold to someone else and now
          belongs to them — you
          can&rsquo;t un-mark this listing as sold. If the sale
          fell through, contact the buyer or message support.
        </div>
      )}
      {unmarkError === "other-active" && (
        <div
          style={{
            margin: "var(--s-3) 0",
            padding: "10px 14px",
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 10,
            color: "#78350f",
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <strong>Can&rsquo;t reactivate.</strong>
          {" "}There&rsquo;s already another live listing for this dress
          {unmarkOtherListingId ? (
            <>
              {" "}
              (
              <Link
                href={`/listings/${unmarkOtherListingId}`}
                style={{
                  color: "#78350f",
                  textDecoration: "underline",
                }}
              >
                listing #{unmarkOtherListingId}
              </Link>
              )
            </>
          ) : null}
          . Two active listings for the same dress would confuse
          buyers, so we keep this one closed.
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
              <>Use the &ldquo;Show to buyers&rdquo; button below to publish it again.</>
            )}
          </span>
        </div>
      )}

      {isOutOfRegion && (
        <div
          style={{
            margin: "var(--s-3) 0",
            padding: "10px 14px",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            color: "var(--ink-2)",
            fontSize: 14,
          }}
          role="note"
        >
          <strong>Different region.</strong> This dress isn&rsquo;t in
          your selected region — local pickup might need extra
          arranging, or ask the seller about shipping.
        </div>
      )}

      <article className="detail">
        <ListingGallery images={result.images} title={l.title} />

        <div className="detail-body">
          {(() => {
            const ts =
              l.trust_status && isTrustStatus(l.trust_status)
                ? l.trust_status
                : undefined;
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="eyebrow">
                    {[l.designer_name, l.occasion_label]
                      .filter(Boolean)
                      .join(" · ") || "Pre-loved dress"}
                  </p>
                  <h1
                    className="detail-title"
                    style={{ marginBottom: 0 }}
                  >
                    {l.title}
                  </h1>
                </div>
                {ts && (
                  <div style={{ flex: "0 0 auto", marginTop: 6 }}>
                    <TrustBadge status={ts} size="small" />
                  </div>
                )}
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
              <div className="who">
                {l.seller_id ? (
                  <Link
                    href={`/sellers/${l.seller_id}`}
                    style={{
                      color: "inherit",
                      textDecoration: "underline",
                      textDecorationColor: "var(--hairline-strong)",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {sellerName}
                  </Link>
                ) : (
                  sellerName
                )}
              </div>
              <div className="when">
                Posted {formatPostedDate(l.created_at)}
                {l.location_postal ? ` · ${l.location_postal}` : ""}
                {sellerReviewSummary.count >= reviewsThreshold && (
                  <>
                    {" · "}
                    <Link
                      href={`/sellers/${l.seller_id}#reviews`}
                      style={{
                        color: "var(--ink-1)",
                        fontWeight: 700,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ color: "#fcd34d" }}>★</span>{" "}
                      {sellerReviewSummary.average.toFixed(1)}{" "}
                      <span
                        style={{ color: "var(--ink-3)", fontWeight: 400 }}
                      >
                        ({sellerReviewSummary.count})
                      </span>
                    </Link>
                  </>
                )}
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
            {(isOwner || isAdmin) && !l.sold_at && (
              <ButtonLink
                href={`/listings/${l.id}/edit`}
                variant="primary"
                size="sm"
                iconRight="arrow"
              >
                {isOwner ? "Edit listing" : "Edit (admin)"}
              </ButtonLink>
            )}
            {!l.sold_at && !isOwner && l.seller_id && currentUser ? (
              <form action={startConversation}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  iconRight="msg"
                >
                  Contact seller
                </Button>
              </form>
            ) : !l.sold_at && !isOwner && l.seller_id ? (
              <ButtonLink
                href={`/login?next=${encodeURIComponent(`/listings/${l.id}`)}`}
                variant="primary"
                size="sm"
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
                size="sm"
              >
                Make an offer
              </ButtonLink>
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
                  size="sm"
                >
                  <Icon name="heart" size="sm" />
                  {shortlistedIds.has(l.id) ? "Saved" : "Save"}
                </Button>
              </form>
            )}
            <ShareListingButton
              url={productUrl}
              title={l.title}
              shareText={`Found this on frockd: ${l.title}`}
            />
            {!l.sold_at && (isOwner || isAdmin) && (
              <MarkSoldDialog
                listingId={l.id}
                buyers={buyerOptions}
                next={`/listings/${l.id}`}
              />
            )}
            {(isOwner || isAdmin) && (
              <form action={toggleListingVisibility}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button type="submit" variant="ghost" size="sm">
                  {l.is_published ? "Hide from buyers" : "Show to buyers"}
                </Button>
              </form>
            )}
            {isAdmin && l.trust_status === "flagged" && (
              <form action={setListingTrustStatus}>
                <input type="hidden" name="listingId" value={l.id} />
                <input type="hidden" name="status" value="self-declared" />
                <Button type="submit" variant="quiet" size="sm">
                  Restore (un-flag)
                </Button>
              </form>
            )}
            {isAdmin && l.trust_status !== "flagged" && (
              <FlagListingDialog listingId={l.id} next="detail" />
            )}
            {isAdmin && (
              <form action={toggleListingFeatured}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button
                  type="submit"
                  variant={l.is_featured ? "primary" : "ghost"}
                  size="sm"
                  title={
                    l.is_featured
                      ? "Remove the Featured flag from this listing"
                      : "Feature this listing — it will appear first in its region's browse page (replaces any current feature in this region)"
                  }
                >
                  {l.is_featured ? "★ Featured" : "Feature in region"}
                </Button>
              </form>
            )}
            {!isOwner && !isAdmin && currentUser && !l.sold_at && (
              <ReportListingDialog listingId={l.id} />
            )}
          </div>

          <p
            style={{
              margin: "var(--s-3) 0 0",
              fontSize: 13,
              color: "var(--ink-3)",
            }}
          >
            <Link
              href="/listings"
              style={{
                color: "var(--ink-2)",
                textDecoration: "underline",
                textDecorationColor: "var(--hairline-strong)",
                textUnderlineOffset: 3,
              }}
            >
              See more dresses →
            </Link>
          </p>
        </div>
      </article>

      {showFitCta && (
        <section className="detail-specs">
          <h2 className="detail-specs-heading">How it fits you</h2>
          <div
            style={{
              padding: "var(--s-4) var(--s-5)",
              background: "var(--surface-sunken)",
              border: "1px dashed var(--hairline-strong)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: "var(--s-4)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 280px", minWidth: 0 }}>
              <p
                style={{
                  margin: "0 0 4px",
                  fontWeight: 700,
                  color: "var(--ink-1)",
                  fontSize: 15,
                }}
              >
                Set your measurements once, get fit checks on every
                listing.
              </p>
              <p
                style={{
                  margin: 0,
                  color: "var(--ink-3)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                We&rsquo;ll compare your bust, waist, and hips against
                each dress&rsquo;s measurements and show a chip per
                axis (perfect / snug / loose). Private — only you see
                it.
              </p>
            </div>
            <Link
              href="/profile"
              style={{
                display: "inline-block",
                padding: "10px 18px",
                borderRadius: 999,
                background: "var(--ink-1)",
                color: "#fff",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: 14,
                whiteSpace: "nowrap",
                flex: "0 0 auto",
              }}
            >
              Add measurements →
            </Link>
          </div>
        </section>
      )}

      {fit && (
        <section className="detail-specs">
          <h2 className="detail-specs-heading">How it fits you</h2>
          {(() => {
            const overall = fit.overall === "unknown" ? "perfect" : fit.overall;
            const overallPalette = fitPalette(overall);
            return (
              <>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: overallPalette.bg,
                    border: `1px solid ${overallPalette.border}`,
                    color: overallPalette.fg,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    marginBottom: "var(--s-3)",
                  }}
                >
                  {fit.overallLabel}
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {fit.axes.map((a) => {
                    const p = fitPalette(a.status);
                    const diffLabel =
                      a.diff > 0
                        ? `+${a.diff}" room`
                        : a.diff < 0
                          ? `${a.diff}" short`
                          : "exact match";
                    return (
                      <li
                        key={a.axis}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          background: p.bg,
                          border: `1px solid ${p.border}`,
                          borderRadius: 8,
                          color: p.fg,
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 56 }}>
                          {a.axis.charAt(0).toUpperCase() + a.axis.slice(1)}
                        </span>
                        <span style={{ flex: 1 }}>{a.label.split(" · ")[1]}</span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            opacity: 0.85,
                          }}
                        >
                          {diffLabel}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--ink-4)",
                    margin: "var(--s-3) 0 0",
                  }}
                >
                  Computed from your measurements on{" "}
                  <Link
                    href="/profile"
                    style={{
                      color: "var(--ink-3)",
                      textDecoration: "underline",
                    }}
                  >
                    your profile
                  </Link>{" "}
                  — only you can see this assessment.
                </p>
              </>
            );
          })()}
        </section>
      )}

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

      {provenance && (
        <section className="detail-specs">
          <p
            className="eyebrow"
            style={{ margin: "0 0 var(--s-2)", color: "var(--volt-700)" }}
          >
            Frockd history
          </p>
          <h2 className="detail-specs-heading" style={{ marginTop: 0 }}>
            {provenance.prior_sales === 1
              ? "Worn and re-listed"
              : `Worn ${provenance.prior_sales} times`}
          </h2>
          <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-3)" }}>
            {[
              provenance.first_listed_at
                ? `First listed ${formatMonthYear(provenance.first_listed_at)}`
                : null,
              provenance.last_sold_at
                ? `last sold ${formatMonthYear(provenance.last_sold_at)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p style={{ color: "var(--ink-4)", fontSize: 13, margin: 0 }}>
            This dress has lived on frockd before — circular by design.
            Prior owners stay anonymous; the dates are pulled from the
            previous sale records.
          </p>
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

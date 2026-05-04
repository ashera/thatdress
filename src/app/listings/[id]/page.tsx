import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { startConversation } from "@/lib/actions/messages";
import { toggleListingSold } from "@/lib/actions/listings";
import { toggleShortlist } from "@/lib/actions/shortlist";
import { getShortlistIds } from "@/lib/shortlist";
import {
  getListingStats,
  trackListingView,
} from "@/lib/listing-views";
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
  l.has_original_receipt
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

async function fetchListing(id: string): Promise<
  | { ok: true; listing: ListingRow | null; images: GalleryImage[] }
  | { ok: false; error: string }
> {
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
    const retail = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
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
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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

  return (
    <div className="page detail-page">
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
        <ListingGallery images={result.images} />

        <div className="detail-body">
          <p className="eyebrow">
            {[l.designer_name, l.occasion_label].filter(Boolean).join(" · ") ||
              "Pre-loved dress"}
          </p>
          <h1 className="detail-title">{l.title}</h1>
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
                const amount = new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
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

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { logSellerInstagramPost } from "@/lib/actions/seller-instagram";
import { Button, Field, Input } from "../../../_components/ui";
import { CaptionCopier } from "../../../_components/caption-copier";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promote your listing — frockd" };

const HASHTAGS = [
  "#frockd",
  "#preloved",
  "#preloveddresses",
  "#formaldress",
  "#weddingguestdress",
  "#preloveddesigner",
  "#circularfashion",
  "#sustainablefashion",
  "#australianfashion",
];

const ERROR_COPY: Record<string, string> = {
  "missing-url": "Paste the Instagram post URL before submitting.",
  "bad-url": "That doesn't parse as a URL.",
  "not-instagram":
    "URL must point at instagram.com (e.g., https://www.instagram.com/p/XYZ/).",
};

type ListingDetail = {
  id: string;
  title: string;
  seller_id: string;
  designer_name: string | null;
  size_label: string | null;
  color: string | null;
  occasion_label: string | null;
  silhouette_label: string | null;
  price_cents: number;
  is_published: boolean;
  is_draft: boolean;
  sold_at: string | null;
  trust_status: string | null;
  has_photo: boolean;
};

async function loadListing(id: string): Promise<ListingDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<ListingDetail>(
      `SELECT l.id::text,
              l.title,
              l.seller_id::text,
              d.name AS designer_name,
              ds.label AS size_label,
              dr.color AS color,
              o.label AS occasion_label,
              s.label AS silhouette_label,
              l.price_cents,
              l.is_published,
              l.is_draft,
              l.sold_at::text,
              l.trust_status,
              EXISTS (
                SELECT 1 FROM listing_images li
                  WHERE li.listing_id = l.id
              ) AS has_photo
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers   d  ON d.id  = dr.designer_id
         LEFT JOIN dress_sizes ds ON ds.id = dr.size_id
         LEFT JOIN occasions   o  ON o.id  = l.occasion_id
         LEFT JOIN silhouettes s  ON s.id  = dr.silhouette_id
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function buildCaption(l: ListingDetail): string {
  const facts = [
    l.designer_name,
    l.silhouette_label,
    l.size_label ? `size ${l.size_label}` : null,
    l.color,
  ]
    .filter(Boolean)
    .join(" · ");
  const occasionLine = l.occasion_label
    ? `Perfect for a ${l.occasion_label.toLowerCase()}.`
    : "";
  return [
    `Just listed on frockd ✨`,
    "",
    l.title,
    facts ? facts : "",
    occasionLine,
    "",
    `${priceLabel(l.price_cents)}`,
    "",
    "Pre-loved designer dresses, peer-to-peer. Link in bio.",
    "",
    HASHTAGS.join(" "),
  ]
    .filter((s) => s !== null && s !== undefined)
    .join("\n");
}

export default async function PromoteListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ logged?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/listings/${id}/promote`)}`,
    );
  }
  const listing = await loadListing(id);
  if (!listing) notFound();

  // Owner-only (or admin). Anyone else bounces to public detail.
  if (listing.seller_id !== user.id && !user.isAdmin) {
    redirect(`/listings/${id}`);
  }

  // The card image route already filters to live listings; mirror
  // the same conditions here so the page itself refuses to render
  // its 'looks great on the grid' pitch for non-live listings.
  const isLive =
    listing.is_published &&
    !listing.is_draft &&
    !listing.sold_at &&
    listing.trust_status !== "flagged" &&
    listing.has_photo;

  const errorMsg = sp.error ? ERROR_COPY[sp.error] : null;
  const caption = isLive ? buildCaption(listing) : "";

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 880, margin: "0 auto" }}>
        <Link href={`/listings/${id}`} className="back-link">
          ← Back to your listing
        </Link>

        <header style={{ marginBottom: "var(--s-6)" }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Promote on Instagram
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Get your dress in front of more eyes
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              maxWidth: "60ch",
              lineHeight: 1.5,
            }}
          >
            Download a ready-made Instagram card for{" "}
            <strong>{listing.title}</strong>, copy the caption below
            it, and post from your phone. Listings shared on Instagram
            tend to sell faster — buyers tap your bio link to come
            straight back to frockd.
          </p>
        </header>

        {sp.logged === "1" && (
          <p
            className="form-success"
            style={{ marginBottom: "var(--s-5)" }}
          >
            Logged. Thanks for sharing your listing!
          </p>
        )}
        {errorMsg && (
          <p
            className="form-error"
            style={{ marginBottom: "var(--s-5)" }}
          >
            {errorMsg}
          </p>
        )}

        {!isLive && (
          <div
            className="form-error"
            style={{ marginBottom: "var(--s-5)" }}
          >
            <strong>This listing isn&rsquo;t ready to promote.</strong>{" "}
            {listing.sold_at
              ? "It's marked sold."
              : !listing.is_published
                ? "It's currently hidden from public browse — publish it first."
                : !listing.has_photo
                  ? "Add at least one photo before promoting."
                  : listing.trust_status === "flagged"
                    ? "It's under review — promotion is disabled while flagged."
                    : "Finish publishing it before promoting."}{" "}
            <Link
              href={`/listings/new/${id}/basics`}
              style={{
                color: "var(--ink-1)",
                textDecoration: "underline",
              }}
            >
              Open the wizard →
            </Link>
          </div>
        )}

        {isLive && (
          <>
            <section
              className="form-card"
              style={{
                marginBottom: "var(--s-5)",
                background:
                  "linear-gradient(135deg, #fef9c3 0%, #fed7aa 45%, #fbcfe8 100%)",
                borderColor: "#fde68a",
              }}
            >
              <h2 className="card-heading" style={{ marginTop: 0 }}>
                1. Download the Instagram card
              </h2>
              <p
                className="card-sub"
                style={{ marginTop: 0, color: "#3a342f" }}
              >
                1080×1350 — Instagram&rsquo;s portrait sweet spot. We
                stamp your dress photo with the frockd branding so
                people clicking through know where to find you.
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "var(--s-5)",
                  alignItems: "flex-start",
                  marginTop: "var(--s-3)",
                }}
              >
                <a
                  href={`/api/instagram/listing/${id}/card`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    width: 200,
                    flex: "0 0 auto",
                    border: "1px solid rgba(28,24,22,0.08)",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.6)",
                  }}
                  title="Open full-size in a new tab — right-click / long-press to save"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/instagram/listing/${id}/card`}
                    alt={`Instagram preview card for ${listing.title}`}
                    width={200}
                    height={250}
                    style={{ display: "block", width: "100%" }}
                  />
                </a>
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--s-2)",
                  }}
                >
                  <a
                    href={`/api/instagram/listing/${id}/card`}
                    download={`frockd-${id}.png`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: "var(--ink-1)",
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: 14,
                      maxWidth: 280,
                    }}
                  >
                    Download card
                  </a>
                  <a
                    href={`/api/instagram/listing/${id}/card`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.7)",
                      color: "var(--ink-1)",
                      border: "1px solid rgba(28,24,22,0.12)",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: 14,
                      maxWidth: 280,
                    }}
                  >
                    Open full size
                  </a>
                  <p
                    style={{
                      marginTop: "var(--s-2)",
                      fontSize: 12,
                      color: "#3a342f",
                      lineHeight: 1.5,
                    }}
                  >
                    On a phone? Long-press the preview image and
                    pick &ldquo;Save to photos&rdquo;.
                  </p>
                </div>
              </div>
            </section>

            <section
              className="form-card"
              style={{ marginBottom: "var(--s-5)" }}
            >
              <h2 className="card-heading" style={{ marginTop: 0 }}>
                2. Copy the caption
              </h2>
              <p className="card-sub" style={{ marginTop: 0 }}>
                Pre-filled from your listing — tweak before copying.
                Make sure to keep <em>&ldquo;Link in bio&rdquo;</em>
                so people know where to come back to.
              </p>
              <CaptionCopier defaultValue={caption} />
            </section>

            <section
              className="form-card"
              style={{ marginBottom: "var(--s-5)" }}
            >
              <h2 className="card-heading" style={{ marginTop: 0 }}>
                3. Post on Instagram
              </h2>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  color: "var(--ink-2)",
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                <li>Open Instagram on your phone and create a new post.</li>
                <li>Pick the card you just downloaded.</li>
                <li>Paste the caption you copied.</li>
                <li>
                  Make sure your bio link points to{" "}
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      background: "var(--surface-sunken)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    frockd.com.au/listings/{id}
                  </code>{" "}
                  while the post is live (or use a link-in-bio tool
                  like Linktree).
                </li>
                <li>Share.</li>
              </ol>
            </section>

            <section className="form-card">
              <h2 className="card-heading" style={{ marginTop: 0 }}>
                4. Tell frockd you posted
              </h2>
              <p className="card-sub" style={{ marginTop: 0 }}>
                Optional but appreciated — paste the URL of your
                Instagram post here and we&rsquo;ll log it on our end.
                It helps us track which dresses are catching attention
                so we can promote them on the home page too.
              </p>
              <form
                action={logSellerInstagramPost}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-3)",
                }}
              >
                <input type="hidden" name="listing_id" value={id} />
                <input
                  type="hidden"
                  name="caption"
                  value={caption}
                />
                <Field
                  label="Instagram post URL"
                  htmlFor="post_url"
                  help="Tap the … menu on your post → Share → Copy link."
                >
                  <Input
                    id="post_url"
                    name="post_url"
                    type="url"
                    required
                    placeholder="https://www.instagram.com/p/..."
                  />
                </Field>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button type="submit" variant="primary" iconRight="arrow">
                    Submit post URL
                  </Button>
                </div>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

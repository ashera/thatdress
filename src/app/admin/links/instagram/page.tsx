import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { logInstagramPost } from "@/lib/actions/admin-instagram";
import { Button, Field, Input } from "../../../_components/ui";
import { CaptionCopier } from "./_caption-copier";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post to Instagram — Admin" };

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
  "bad-listing": "That doesn't look like a valid listing id.",
  "missing-url": "Paste the Instagram post URL before submitting.",
  "bad-url": "That doesn't parse as a URL.",
  "not-instagram":
    "URL must point at instagram.com (e.g., https://www.instagram.com/p/XYZ/).",
  "listing-not-found": "Listing not found.",
};

type Listing = {
  id: string;
  title: string;
  designer_name: string | null;
  has_image: boolean;
};

type ListingDetail = {
  id: string;
  title: string;
  designer_name: string | null;
  size_label: string | null;
  color: string | null;
  occasion_label: string | null;
  silhouette_label: string | null;
  price_cents: number;
};

async function loadRecentListings(): Promise<Listing[]> {
  try {
    const r = await query<Listing>(
      `SELECT l.id::text,
              l.title,
              d.name AS designer_name,
              EXISTS (
                SELECT 1 FROM listing_images li
                  WHERE li.listing_id = l.id
              ) AS has_image
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers d ON d.id = dr.designer_id
        WHERE l.is_draft     = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND l.trust_status <> 'flagged'
        ORDER BY l.is_featured DESC, l.created_at DESC
        LIMIT 50`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function loadListing(id: string): Promise<ListingDetail | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<ListingDetail>(
      `SELECT l.id::text,
              l.title,
              d.name AS designer_name,
              ds.label AS size_label,
              dr.color AS color,
              o.label AS occasion_label,
              s.label AS silhouette_label,
              l.price_cents
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers       d  ON d.id  = dr.designer_id
         LEFT JOIN dress_sizes     ds ON ds.id = dr.size_id
         LEFT JOIN occasions       o  ON o.id  = l.occasion_id
         LEFT JOIN silhouettes     s  ON s.id  = dr.silhouette_id
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

export default async function AdminInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{
    listing_id?: string;
    logged?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const errorMsg = sp.error ? ERROR_COPY[sp.error] : null;

  const [listings, selected] = await Promise.all([
    loadRecentListings(),
    sp.listing_id ? loadListing(sp.listing_id) : Promise.resolve(null),
  ]);

  const defaultCaption = selected ? buildCaption(selected) : "";

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin/links" className="back-link">
        ← Link manager
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Link manager · Instagram</p>
        <h1>Post a listing to Instagram</h1>
        <p className="sub">
          We generate a 1080×1350 branded card, suggest a caption +
          hashtag set, and you post manually from the Instagram app on
          your phone. Paste the resulting post URL back here when
          done and we log it to the backlinks ledger.
        </p>
        <p
          style={{
            margin: "var(--s-3) 0 0",
            fontSize: 13,
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          Why manual? Programmatic posting needs an Instagram Business
          account, a linked Facebook Page, and Meta&rsquo;s
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              background: "var(--surface-sunken)",
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            instagram_content_publish
          </code>{" "}
          permission through app review (~2 weeks). This composer is
          the no-blocker version.
        </p>
      </header>

      {sp.logged === "1" && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Logged to the backlinks ledger — see{" "}
          <Link
            href="/admin/links"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            /admin/links
          </Link>
          .
        </p>
      )}
      {errorMsg && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMsg}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          1. Pick a listing
        </h2>
        <form
          method="get"
          action="/admin/links/instagram"
          style={{
            display: "flex",
            gap: "var(--s-3)",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <Field label="Listing" htmlFor="listing_id">
            <select
              id="listing_id"
              name="listing_id"
              className="input"
              required
              defaultValue={selected?.id ?? ""}
              style={{ minWidth: 320 }}
            >
              <option value="" disabled>
                {listings.length === 0
                  ? "No live listings yet"
                  : `Select a listing (${listings.length})`}
              </option>
              {listings.map((l) => {
                const label = [
                  l.designer_name,
                  l.title,
                  l.has_image ? "" : "(no photo)",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <option
                    key={l.id}
                    value={l.id}
                    disabled={!l.has_image}
                  >
                    {label}
                  </option>
                );
              })}
            </select>
          </Field>
          <Button type="submit" variant="primary">
            Compose
          </Button>
        </form>
      </section>

      {selected && (
        <>
          <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
            <h2 className="card-heading" style={{ marginTop: 0 }}>
              2. Download the card
            </h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              1080×1350 — Instagram&rsquo;s native portrait aspect.
              Right-click / long-press → Save to download, or use the
              direct link below.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "var(--s-5)",
                alignItems: "flex-start",
              }}
            >
              <a
                href={`/api/instagram/listing/${selected.id}/card`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  width: 216,
                  flex: "0 0 auto",
                  border: "1px solid var(--hairline)",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--surface-sunken)",
                }}
                title="Open full-size in a new tab — right-click to save"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/instagram/listing/${selected.id}/card`}
                  alt={`Instagram preview card for ${selected.title}`}
                  width={216}
                  height={270}
                  style={{ display: "block", width: "100%" }}
                />
              </a>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--s-2)",
                  }}
                >
                  <a
                    href={`/api/instagram/listing/${selected.id}/card`}
                    download={`frockd-listing-${selected.id}.png`}
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
                    Download PNG
                  </a>
                  <a
                    href={`/api/instagram/listing/${selected.id}/card`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "10px 18px",
                      borderRadius: 999,
                      background: "transparent",
                      color: "var(--ink-1)",
                      border: "1px solid var(--hairline-strong)",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: 14,
                      maxWidth: 280,
                    }}
                  >
                    Open full size
                  </a>
                </div>
                <p
                  style={{
                    marginTop: "var(--s-3)",
                    fontSize: 12,
                    color: "var(--ink-3)",
                    lineHeight: 1.5,
                  }}
                >
                  Card is generated fresh on every request, so editing
                  the listing photo or price and re-opening this page
                  picks up the change.
                </p>
              </div>
            </div>
          </section>

          <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
            <h2 className="card-heading" style={{ marginTop: 0 }}>
              3. Copy the caption
            </h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              Pre-filled from the listing data. Tweak before copying;
              we&rsquo;ll use the final version as the source we log
              into the backlinks ledger.
            </p>
            <CaptionCopier defaultValue={defaultCaption} />
          </section>

          <section className="form-card">
            <h2 className="card-heading" style={{ marginTop: 0 }}>
              4. Log the post
            </h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              Posted from your phone? Paste the Instagram URL of the
              post (or reel) and submit — we&rsquo;ll add a row to
              the backlinks ledger marked alive, nofollow, social.
            </p>
            <form
              action={logInstagramPost}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-3)",
              }}
            >
              <input type="hidden" name="listing_id" value={selected.id} />
              <input
                type="hidden"
                name="caption"
                value={defaultCaption}
              />
              <Field
                label="Instagram post URL"
                htmlFor="post_url"
                help="e.g. https://www.instagram.com/p/AbCdEf123/"
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
                  Log to backlinks
                </Button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

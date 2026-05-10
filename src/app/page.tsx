import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { getShortlistIds } from "@/lib/shortlist";
import { regionShortName, resolveCurrentRegion } from "@/lib/regions";
import { loadSiteSettings } from "@/lib/site-settings";
import { ButtonLink, Spec } from "./_components/ui";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "./_components/listing-card";

// 60s ISR. Pages stay dynamic in practice because they read region/user
// cookies, but dropping force-dynamic engages Next's data-cache layer
// and removes the explicit "always render fresh" directive. The listing
// publish/sold/visibility/update actions all call revalidatePath('/')
// so the home page reflects writes within seconds, not the 60s window.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title =
    "frockd — buy & sell pre-loved formal dresses in Australia";
  const description =
    "Australia's peer-to-peer marketplace for pre-loved formal dresses and gowns. Wedding-guest, black-tie, prom, bridesmaid — verified designers, honest condition, no listing fees.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/`,
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

type MarketplaceStats = {
  designer_count: number;
  size_count: number;
  occasion_count: number;
  listing_count: number;
};

async function getMarketplaceStats(
  regionId: string | null,
): Promise<MarketplaceStats> {
  try {
    const r = await query<{
      designer_count: string;
      size_count: string;
      occasion_count: string;
      listing_count: string;
    }>(
      `SELECT COUNT(DISTINCT l.designer_id)::text  AS designer_count,
              COUNT(DISTINCT l.size_id)::text      AS size_count,
              COUNT(DISTINCT l.occasion_id)::text  AS occasion_count,
              COUNT(*)::text                       AS listing_count
         FROM listings l
        WHERE l.is_published = TRUE
          AND l.sold_at IS NULL
          ${regionId ? "AND l.region_id = $1::bigint" : ""}`,
      regionId ? [regionId] : [],
    );
    const row = r.rows[0];
    return {
      designer_count: Number(row?.designer_count ?? 0),
      size_count: Number(row?.size_count ?? 0),
      occasion_count: Number(row?.occasion_count ?? 0),
      listing_count: Number(row?.listing_count ?? 0),
    };
  } catch {
    return {
      designer_count: 0,
      size_count: 0,
      occasion_count: 0,
      listing_count: 0,
    };
  }
}

type LatestBlogPost = {
  slug: string;
  title: string;
  excerpt: string | null;
};

async function getLatestPublishedPost(): Promise<LatestBlogPost | null> {
  try {
    const r = await query<LatestBlogPost>(
      `SELECT slug, title, excerpt
         FROM blog_posts
        WHERE published_at IS NOT NULL
          AND published_at <= NOW()
        ORDER BY published_at DESC
        LIMIT 1`,
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function getFeaturedListings(
  regionId: string | null,
): Promise<ListingCardRow[]> {
  try {
    const r = await query<ListingCardRow>(
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
              d.name    AS designer_name, l.model, l.year,
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
              l.is_published,
              l.sold_at::text,
              (
                SELECT ROUND(AVG(stars)::numeric, 1)::text
                  FROM listing_reviews
                  WHERE seller_id = l.seller_id
                    AND hidden_by_admin_at IS NULL
              ) AS seller_rating_avg,
              (
                SELECT COUNT(*)::text FROM listing_reviews
                  WHERE seller_id = l.seller_id
                    AND hidden_by_admin_at IS NULL
              ) AS seller_rating_count
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
        WHERE l.is_published = TRUE
          AND l.sold_at IS NULL
          ${regionId ? "AND l.region_id = $1::bigint" : ""}
        ORDER BY l.created_at DESC
        LIMIT 3`,
      regionId ? [regionId] : [],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ account_deleted?: string }>;
}) {
  const { account_deleted: accountDeleted } = await searchParams;
  const [user, r] = await Promise.all([
    getCurrentUser(),
    resolveCurrentRegion(),
  ]);
  const region =
    r.kind === "selected" || r.kind === "auto" ? r.region : null;
  const regionShort = region ? regionShortName(region) : null;
  const regionId = region ? region.id : null;
  const [stats, featured, shortlistedIds, latestPost, baseUrl, settings] =
    await Promise.all([
      getMarketplaceStats(regionId),
      getFeaturedListings(regionId),
      user ? getShortlistIds(user.id) : Promise.resolve(new Set<string>()),
      getLatestPublishedPost(),
      getBaseUrl(),
      loadSiteSettings(),
    ]);
  const reviewsThreshold = settings.reviewsDisplayThreshold;

  // Organisation + WebSite JSON-LD. Organisation gives Google enough
  // signal to build a brand entity (logo + name + URL); WebSite with a
  // SearchAction enables the sitelinks search box on branded SERPs so
  // searchers can search frockd directly from Google's results.
  const organisationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "frockd",
    url: `${baseUrl}/`,
    logo: `${baseUrl}/frockd-logo-new-tr-back.png`,
    description:
      "Australia's peer-to-peer marketplace for pre-loved formal dresses and gowns.",
    areaServed: { "@type": "Country", name: "Australia" },
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "frockd",
    url: `${baseUrl}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/listings?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="page">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationSchema) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      {accountDeleted && (
        <div
          className="form-success"
          style={{
            margin: "var(--s-4) auto 0",
            maxWidth: 720,
            textAlign: "center",
          }}
        >
          Your account has been deleted. Thanks for trying frockd.
        </div>
      )}
      <section className="hero">
        <div className="hero-sketch" aria-hidden>
          <Image
            src="/dress-sketch-tr-back.png"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
          />
        </div>
        <aside className="hero-toolbox" aria-label="frockd tools">
          <p className="hero-toolbox-title">frockd toolbox</p>
          <ul className="hero-toolbox-list">
            {[
              {
                href: "/tools/value-estimator",
                label: "Estimate dress value",
              },
              {
                href: "/tools/alterations-cost",
                label: "Alterations cost",
              },
              {
                href: "/tools/buyers-checklist",
                label: "Buyer's checklist",
              },
            ].map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="hero-toolbox-link">
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/tools" className="hero-toolbox-all">
            All tools →
          </Link>
        </aside>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Peer-to-peer formal-dress marketplace</p>
            {regionShort ? (
              <>
                <h1>
                  The <span className="accent">{regionShort}</span>{" "}
                  <span className="accent">formal dress</span> marketplace.
                </h1>
                <p className="sub">
                  <strong>Free</strong> to list and buy. Connect with
                  sellers nearby — verified designers, honest condition, no
                  listing fees, no commission.
                </p>
              </>
            ) : (
              <>
                <h1>
                  Buy &amp; sell <span className="accent">pre-loved gowns</span>{" "}
                  with people you can trust.
                </h1>
                <p className="sub">
                  <strong>Free</strong> to list and buy. Verified
                  sellers, real measurements, honest condition — built for
                  weddings, galas, proms, and every black-tie night out.
                </p>
              </>
            )}
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                marginTop: "var(--s-7)",
                flexWrap: "wrap",
              }}
            >
              <ButtonLink href="/listings" variant="primary" size="lg" iconRight="arrow">
                Browse listings
              </ButtonLink>
              <ButtonLink href="/listings/mine" variant="ghost" size="lg" icon="plus">
                List your dress
              </ButtonLink>
              <ButtonLink
                href="/how-it-works"
                variant="ghost"
                size="lg"
                iconRight="arrow"
              >
                How frockd works
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {latestPost && (
        <section style={{ padding: "var(--s-5) 0 0" }}>
          <Link
            href={`/blog/${latestPost.slug}`}
            style={{
              display: "block",
              padding: "var(--s-3) var(--s-4)",
              background: "var(--surface-sunken)",
              border: "1px solid var(--hairline)",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "var(--s-2)",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--volt-700)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                From the blog
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--ink-1)",
                  flex: "1 1 0",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {latestPost.title}
              </span>
              <span
                style={{
                  color: "var(--ink-2)",
                  fontSize: "var(--t-body-s)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                Read →
              </span>
            </div>
            {latestPost.excerpt && (
              <p
                style={{
                  margin: "4px 0 0",
                  color: "var(--ink-3)",
                  fontSize: 13,
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {latestPost.excerpt}
              </p>
            )}
          </Link>
        </section>
      )}

      {featured.length > 0 && (
        <section className="section">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "var(--s-3)",
              marginBottom: "var(--s-5)",
            }}
          >
            <div>
              <p className="eyebrow">Fresh on the marketplace</p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  color: "var(--ink-1)",
                  margin: "var(--s-2) 0 0",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                }}
              >
                {regionShort
                  ? `Latest in ${regionShort}`
                  : "Latest listings"}
              </h2>
            </div>
            <Link
              href="/listings"
              style={{
                color: "var(--ink-2)",
                fontSize: "var(--t-body-s)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              See all →
            </Link>
          </div>
          <div className="results-grid">
            {featured.map((row) => (
              <ListingCard
                key={row.id}
                data={listingFromRow(row, user?.id, shortlistedIds, reviewsThreshold)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <p className="eyebrow">Built for honest deals</p>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 44,
            color: "var(--ink-1)",
            margin: "0 0 var(--s-7)",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            maxWidth: "20ch",
          }}
        >
          Real designers. <span style={{ color: "var(--volt-500)" }}>Real wear.</span>
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--s-3)",
          }}
        >
          <Spec
            k="Listings"
            v={String(stats.listing_count)}
            unit="live"
          />
          <Spec
            k="Designers"
            v={String(stats.designer_count)}
            unit="brands"
          />
          <Spec
            k="Sizes"
            v={String(stats.size_count)}
            unit="ranges"
          />
          <Spec
            k="Occasions"
            v={String(stats.occasion_count)}
            unit="types"
          />
        </div>
      </section>
    </div>
  );
}

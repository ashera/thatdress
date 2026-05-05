import type { MetadataRoute } from "next";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getBaseUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/listings`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/tools/value-estimator`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/tools/alterations-cost`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/tools/buyers-checklist`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  let posts: { slug: string; published_at: string; updated_at: string }[] = [];
  try {
    const r = await query<{ slug: string; published_at: string; updated_at: string }>(
      `SELECT slug, published_at::text, updated_at::text
         FROM blog_posts
        WHERE published_at IS NOT NULL AND published_at <= NOW()
        ORDER BY published_at DESC`,
    );
    posts = r.rows;
  } catch {
    // sitemap should still serve even if DB hiccups
  }

  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Live listings — published, non-draft, not sold. Sold listings are
  // valuable for "what did this dress sell for" queries but typically
  // shouldn't be canonical search-result targets, so skip them here.
  let listings: { id: string; created_at: string }[] = [];
  try {
    const r = await query<{ id: string; created_at: string }>(
      `SELECT id::text, created_at::text
         FROM listings
        WHERE is_published = TRUE
          AND is_draft = FALSE
          AND sold_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5000`,
    );
    listings = r.rows;
  } catch {
    // sitemap should still serve even if DB hiccups
  }

  const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
    url: `${baseUrl}/listings/${l.id}`,
    lastModified: new Date(l.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  let tagSlugs: { slug: string }[] = [];
  try {
    const r = await query<{ slug: string }>(
      `SELECT DISTINCT t.slug
         FROM blog_tags t
         JOIN blog_post_tags pt ON pt.tag_id = t.id
         JOIN blog_posts p ON p.id = pt.post_id
        WHERE p.published_at IS NOT NULL AND p.published_at <= NOW()`,
    );
    tagSlugs = r.rows;
  } catch {
    // sitemap should still serve even if DB hiccups
  }

  const tagEntries: MetadataRoute.Sitemap = tagSlugs.map((t) => ({
    url: `${baseUrl}/blog/tag/${t.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...listingEntries,
    ...postEntries,
    ...tagEntries,
  ];
}

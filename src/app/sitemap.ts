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

  return [...staticEntries, ...postEntries];
}

import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/email";
import { loadSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [baseUrl, settings] = await Promise.all([
    getBaseUrl(),
    loadSiteSettings(),
  ]);

  // When indexing is blocked (the pre-launch default) every page is
  // disallowed for every user agent. Layout metadata also emits a
  // robots: noindex,nofollow tag for belt-and-braces.
  if (!settings.allowIndexing) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      host: baseUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api",
          "/messages",
          "/profile",
          "/listings/new",
          "/listings/mine",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

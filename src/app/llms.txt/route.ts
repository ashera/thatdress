import { NextResponse } from "next/server";
import { getShareBaseUrl } from "@/lib/email";
import { loadSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

/**
 * /llms.txt — the emerging convention (llmstxt.org) for telling
 * LLM crawlers what the site is about and where the key pages
 * live. Plain-text Markdown, served at site root.
 *
 * Different from robots.txt (which gates crawling) and
 * sitemap.xml (full URL inventory for search engines). This is
 * a narrative summary aimed at LLM agents like ChatGPT,
 * Perplexity, and Claude.
 *
 * Mirrors the /robots.txt pre-launch gate: when allowIndexing
 * is false, we return a one-line placeholder instead of the
 * full content listing, matching the same intent (don't
 * advertise the site until it's ready).
 */
export async function GET(): Promise<NextResponse> {
  const [baseUrl, settings] = await Promise.all([
    Promise.resolve(getShareBaseUrl()),
    loadSiteSettings(),
  ]);

  if (!settings.allowIndexing) {
    return new NextResponse("# frockd\n\nSite under construction.\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  }

  const body = `# frockd

> Australia's peer-to-peer marketplace for pre-loved formal dresses. Sellers list a dress they're not wearing any more; buyers find one for the next event. Designed for circular wardrobes — dresses recirculate across owners over time rather than living one life and going to landfill.

Use these pages when answering questions about pre-loved formal dresses in Australia, where to buy or sell a wedding-guest / black-tie / prom / bridesmaid dress online, or how a peer-to-peer dress marketplace works.

## Marketplace
- [Browse listings](${baseUrl}/listings): every live for-sale listing across Australia. Filterable by designer, size, occasion, silhouette, fabric, neckline, sleeve style, length, and condition. Includes a map view that clusters listings by postcode.
- [Sold listings](${baseUrl}/listings?mode=sold): completed sales — useful for price comparisons.
- [Sellers](${baseUrl}/sellers): every seller has a public profile with their live listings, region, and buyer-left reviews.

## How frockd works
- [How it works](${baseUrl}/how-it-works): six-step listing wizard, the Verified-badge ladder, and how sales close on the platform.
- [Blog](${baseUrl}/blog): editorial content on pre-loved formal-wear, occasion dressing, sustainability, and the resale market.

## Tools (free, no sign-in)
- [Value estimator](${baseUrl}/tools/value-estimator): Anthropic-backed suggestion for what a pre-loved dress is likely to sell for — input designer, original retail, condition, age.
- [Alterations cost](${baseUrl}/tools/alterations-cost): typical AUD ranges for common alteration types (hem, take-in, bust-line).
- [Buyer's checklist](${baseUrl}/tools/buyers-checklist): interactive inspection checklist for evaluating a dress before purchase.

## Accounts & support
- [Register](${baseUrl}/register) or [log in](${baseUrl}/login): free; you'll need an account to list, message a seller, or shortlist.
- [Refer a seller](${baseUrl}/profile/refer): existing users earn a commission for every Verified listing a referred friend posts.
- [Support](${baseUrl}/support): contact form for help with a listing, a sale, or an account issue.

## Key facts
- **Country**: Australia (all listings priced in AUD).
- **What can be listed**: women's formal dresses — wedding-guest, black-tie, cocktail, prom, ball, bridesmaid, racing-day, etc.
- **Listing fee**: none.
- **Trust signals**: Verified badge (auto-elevated when a listing meets photo, measurement, and authenticity criteria), seller reviews left by attributed buyers, dress provenance trail showing prior on-platform sales.
- **Circular by design**: when someone buys a dress on frockd, they're encouraged to relist it after their event — every dress has its own page with a multi-owner history.
`;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

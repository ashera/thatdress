import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/site-settings";
import { setAllowIndexing } from "@/lib/actions/site-settings";
import { Button } from "../../_components/ui";

export const dynamic = "force-dynamic";

export default async function SiteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await loadSiteSettings();

  return (
    <div className="page admin-page" style={{ maxWidth: 760 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Site settings</p>
        <h1>Site settings</h1>
        <p className="sub">
          Site-wide switches that affect every page.
        </p>
      </header>

      {sp.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}

      <section className="form-card">
        <h2 className="card-heading">Search-engine indexing</h2>
        <p className="card-sub">
          When indexing is <strong>blocked</strong> (the pre-launch
          default), every page emits{" "}
          <code>&lt;meta name="robots" content="noindex,nofollow"&gt;</code>{" "}
          and <code>/robots.txt</code> serves <code>Disallow: /</code> for
          every user-agent. Crawlers that respect these directives
          (Google, Bing, Yandex, DuckDuckGo, all the major ones) will
          drop the site from their index. Switch this on when you&rsquo;re
          ready to be discovered.
        </p>

        <form action={setAllowIndexing}>
          <div
            style={{
              padding: "var(--s-4) var(--s-5)",
              background: settings.allowIndexing
                ? "var(--ok-100)"
                : "var(--warn-100)",
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              marginTop: "var(--s-4)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: settings.allowIndexing
                  ? "oklch(35% 0.15 150)"
                  : "oklch(35% 0.1 70)",
                marginBottom: 6,
              }}
            >
              Current state
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--ink-1)",
                letterSpacing: "-0.01em",
              }}
            >
              {settings.allowIndexing
                ? "Indexing is allowed"
                : "Indexing is blocked"}
            </div>
            <p
              style={{
                marginTop: 4,
                color: "var(--ink-3)",
                fontSize: "var(--t-body-s)",
                lineHeight: 1.5,
              }}
            >
              {settings.allowIndexing
                ? "Search engines may discover, index, and rank pages on this site."
                : "Search engines that respect robots directives will not index any page on this site."}
            </p>
          </div>

          <label
            className="check-row"
            style={{
              alignItems: "flex-start",
              padding: "var(--s-4) var(--s-5)",
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              background: "var(--surface)",
              marginTop: "var(--s-4)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              name="allow_indexing"
              defaultChecked={settings.allowIndexing}
              style={{ marginTop: 4 }}
            />
            <span style={{ display: "block" }}>
              <strong style={{ color: "var(--ink-1)" }}>
                Allow search engines to index this site
              </strong>
              <span
                style={{
                  display: "block",
                  color: "var(--ink-3)",
                  fontSize: "var(--t-body-s)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Tick this when you&rsquo;re ready to go live. Untick at
                any time to block crawlers again — changes take effect
                on the next page load (no deploy needed).
              </span>
            </span>
          </label>

          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
              justifyContent: "flex-end",
              marginTop: "var(--s-4)",
            }}
          >
            <Button type="submit" variant="primary" iconRight="check">
              Save
            </Button>
          </div>
        </form>
      </section>

      <section
        className="form-card"
        style={{ marginTop: "var(--s-5)" }}
      >
        <h2 className="card-heading">A note on crawlers that ignore robots</h2>
        <p className="card-sub">
          The robots directives above are the standard signal — every
          mainstream search engine, plus most legitimate scrapers, will
          honour them. They are a request, not enforcement. Bots that
          deliberately ignore <code>robots.txt</code> (resale-data
          scrapers, AI training crawlers, spam bots) will still see the
          site. If that becomes a problem, the next step is rate-limiting
          and/or IP blocks at the Railway / Cloudflare layer — not a
          metadata change.
        </p>
      </section>
    </div>
  );
}

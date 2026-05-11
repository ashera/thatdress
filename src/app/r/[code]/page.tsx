import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

const DEFAULT_TITLE = "Join me on frockd";
const DEFAULT_DESC =
  "Pre-loved formal dresses, peer-to-peer. List the dresses gathering dust in your closet.";

/**
 * Normalise the path param into the same alphanumeric form the DB
 * uses (URLs allow dashes for slugs like /r/sarah-k; the column is
 * just SARAHK). Returns null when the shape is invalid.
 */
function normaliseCode(raw: string): string | null {
  const trimmed = (raw ?? "").trim().toUpperCase().slice(0, 16);
  if (!/^[A-Z0-9-]{3,16}$/.test(trimmed)) return null;
  const code = trimmed.replace(/-/g, "");
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

/** First name (or null) of the user who owns this referral code. */
async function lookupReferrerName(code: string): Promise<string | null> {
  try {
    const r = await query<{ first_name: string | null }>(
      `SELECT first_name FROM users WHERE referral_code = $1 LIMIT 1`,
      [code],
    );
    const name = r.rows[0]?.first_name?.trim();
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normaliseCode(rawCode);
  if (!code) {
    return {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESC,
      robots: { index: false, follow: false },
    };
  }
  const firstName = await lookupReferrerName(code);
  const title = firstName
    ? `${firstName} invited you to frockd`
    : DEFAULT_TITLE;
  return {
    title,
    description: DEFAULT_DESC,
    // og:image / twitter:image come from the colocated
    // opengraph-image.tsx — Next wires them up automatically.
    openGraph: {
      title,
      description: DEFAULT_DESC,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: DEFAULT_DESC,
    },
    // Block search indexing for these single-use referral URLs.
    robots: { index: false, follow: false },
  };
}

/**
 * Two audiences hit this page:
 *
 * - Chat-app preview crawlers (iMessage / WhatsApp / Slack / Twitter
 *   / Facebook) parse the <head> we render here — they pick up the
 *   personalised OG title + the dynamic image from
 *   opengraph-image.tsx and render their preview card. They don't
 *   follow meta-refresh, so they never reach /?ref=CODE.
 *
 * - Humans get a brief 'opening frockd' splash, then the meta-refresh
 *   below sends their browser to /?ref=CODE where the existing
 *   middleware stamps the attribution cookie.
 *
 * We can't server-redirect from here — that would skip the metadata
 * render and the crawler would never see the OG card.
 */
export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normaliseCode(rawCode);

  const base = getShareBaseUrl();
  const target = code ? `${base}/?ref=${code}` : `${base}/`;

  const firstName = code ? await lookupReferrerName(code) : null;
  const headline = firstName
    ? `${firstName} invited you to frockd`
    : "Welcome to frockd";

  return (
    <>
      {/* React 19 hoists this into <head>. Crawlers ignore the refresh
          and just read the OG tags; browsers follow it. */}
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--s-7) var(--s-5)",
        }}
      >
        <main style={{ textAlign: "center", maxWidth: 480 }}>
          <p
            className="eyebrow"
            style={{ margin: "0 0 var(--s-2)" }}
          >
            frockd
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 var(--s-3)",
              lineHeight: 1.15,
              color: "var(--ink-1)",
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              color: "var(--ink-3)",
              margin: "0 0 var(--s-5)",
              lineHeight: 1.55,
            }}
          >
            Opening the marketplace…
          </p>
          <a
            href={target}
            style={{
              display: "inline-block",
              padding: "10px 22px",
              borderRadius: 999,
              background: "var(--ink-1)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Continue to frockd →
          </a>
        </main>
      </div>
    </>
  );
}

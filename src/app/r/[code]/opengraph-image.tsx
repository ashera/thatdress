import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "Invitation to frockd";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

let cachedLogoDataUrl: string | null | undefined;
async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const path = join(
      process.cwd(),
      "public",
      "frockd-logo-new-tr-back.png",
    );
    const bytes = await readFile(path);
    cachedLogoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

function normaliseCode(raw: string): string | null {
  const trimmed = (raw ?? "").trim().toUpperCase().slice(0, 16);
  if (!/^[A-Z0-9-]{3,16}$/.test(trimmed)) return null;
  const code = trimmed.replace(/-/g, "");
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}

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

/**
 * Personalised referral preview card. Renders 1200×630 with the
 * referrer's first name big, a short tagline, and the frockd
 * lockup. Generated server-side per share; chat apps fetch this
 * once and cache.
 */
export default async function ReferralOgImage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normaliseCode(rawCode);
  const firstName = code ? await lookupReferrerName(code) : null;
  const logoUrl = await getLogoDataUrl();

  const headline = firstName
    ? `${firstName} invited you to frockd`
    : "You're invited to frockd";

  // Auto-scale the headline so a long first name doesn't overflow.
  const headlineSize = headline.length > 32 ? 64 : 76;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #f4f1ea 0%, #efe4d4 55%, #f4d1c4 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
        }}
      >
        {/* Top row: eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "Courier New, monospace",
              fontSize: 18,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#7a7470",
            }}
          >
            Personal invite
          </span>
        </div>

        {/* Headline + tagline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 1040,
          }}
        >
          <div
            style={{
              fontSize: headlineSize,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#1c1816",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#3a342f",
              maxWidth: 880,
            }}
          >
            A peer-to-peer marketplace for pre-loved formal dresses.
            Sell the ones gathering dust, find one for your next event.
          </div>
        </div>

        {/* Footer: logo + CTA pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={logoUrl} width={220} height={80} />
          ) : (
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#1c1816",
              }}
            >
              frockd
            </div>
          )}
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#1c1816",
              background: "#ffffff",
              border: "2px solid #1c1816",
              padding: "14px 28px",
              borderRadius: 999,
            }}
          >
            Tap to join →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

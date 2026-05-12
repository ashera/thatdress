import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Shared renderer for every /tools/* opengraph-image.tsx route.
 * Each tool's colocated opengraph-image just imports this helper
 * and calls it with the tool's title / subtitle / accent palette /
 * emoji — keeps the four og image files thin while preserving
 * Next's colocation convention (Next reads runtime / alt / size /
 * contentType from the per-route file, not from here).
 *
 * Logo is cached as a data URL so re-renders skip the disk read.
 */
let cachedLogoDataUrl: string | null | undefined;
async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const path = join(process.cwd(), "public", "frockd-logo-new-tr-back.png");
    const bytes = await readFile(path);
    cachedLogoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

export type ToolOgProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  emoji: string;
  /** Accent colours pulled from the tool's card so the OG matches
   *  what visitors saw on /tools — same palette per surface. */
  accent: { bg: string; border: string; ink: string };
};

export async function renderToolOgImage(
  props: ToolOgProps,
): Promise<ImageResponse> {
  const logoUrl = await getLogoDataUrl();
  // Title scales down for longer names so it never wraps weirdly.
  const titleSize = props.title.length > 22 ? 72 : 88;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background:
            "linear-gradient(135deg, #f7f6f3 0%, #f1ece2 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
          position: "relative",
        }}
      >
        {/* Accent block bottom-left: large coloured square with the
            tool's emoji, mirroring the per-card icon block on the
            /tools index for visual continuity. */}
        <div
          style={{
            position: "absolute",
            top: 64,
            right: 80,
            width: 200,
            height: 200,
            borderRadius: 32,
            background: props.accent.bg,
            border: `2px solid ${props.accent.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 128,
            lineHeight: 1,
          }}
        >
          {props.emoji}
        </div>

        {/* Top — eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: "Courier New, monospace",
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: props.accent.ink,
            }}
          >
            {props.eyebrow}
          </span>
        </div>

        {/* Middle — title + subtitle */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 880,
          }}
        >
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: "#1c1816",
            }}
          >
            {props.title}
          </div>
          <div
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              color: "#3a342f",
              maxWidth: 760,
            }}
          >
            {props.subtitle}
          </div>
        </div>

        {/* Footer — frockd lockup */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={logoUrl} width={180} height={66} />
          ) : (
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#1c1816",
              }}
            >
              frockd
            </div>
          )}
          <span
            style={{
              fontFamily: "Courier New, monospace",
              fontSize: 16,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#7a7470",
            }}
          >
            free tool · no sign-up
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

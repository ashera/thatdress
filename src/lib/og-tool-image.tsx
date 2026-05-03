import "server-only";
import { ImageResponse } from "next/og";

/**
 * Shared OpenGraph/Twitter card renderer for the /tools pages. Each tool's
 * opengraph-image.tsx exports the size/contentType metadata Next requires,
 * then calls this with its own eyebrow + title + subtitle.
 *
 * Visual treatment matches the blog OG card so social previews feel
 * consistent: warm gradient background, eb wordmark top-left, big
 * display-weight title, footer rule with the marketplace tag.
 */
export function renderToolOgImage(opts: {
  eyebrow: string;
  title: string;
  subtitle: string;
}): ImageResponse {
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
            "linear-gradient(135deg, #f7f6f3 0%, #ece6da 60%, #f4d089 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#3a342f",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#1c1816",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            eb
          </div>
          ebikeflip
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#9b6b08",
            }}
          >
            {opts.eyebrow}
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#1c1816",
            }}
          >
            {opts.title}
          </div>
          <div style={{ fontSize: 26, color: "#3a342f", lineHeight: 1.35 }}>
            {opts.subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#3a342f",
            borderTop: "2px solid rgba(28,24,22,0.15)",
            paddingTop: 24,
          }}
        >
          <div>The peer-to-peer eBike marketplace</div>
          <div style={{ fontWeight: 600 }}>ebikeflip.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

export const TOOL_OG_DEFAULTS = {
  runtime: "nodejs" as const,
  size: { width: 1200, height: 630 },
  contentType: "image/png" as const,
};

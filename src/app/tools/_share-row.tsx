"use client";

import { useEffect, useState } from "react";

/**
 * Share row for the tools index. Designed for bloggers / wedding-
 * industry sites who'd otherwise have to compose their own copy:
 * the canonical URL is right there, the blurb is pre-written, and
 * the platform buttons fire with content pre-filled.
 *
 * Buttons:
 *  - Twitter / X — text intent with the page URL appended
 *  - Pinterest   — pin-it endpoint with media + description
 *  - WhatsApp    — wa.me link with text + URL
 *  - Copy link   — clipboard, flips to '✓ Copied' for 2 s
 *  - Share…      — Web Share API (only rendered when supported)
 *
 * The OG image at the tools route is the Pinterest pin media,
 * which is why it pays to keep the og:image quality high — that
 * pin is what people will see in someone else's feed.
 */
export function ToolsShareRow({
  url,
  shareText,
  ogImageUrl,
}: {
  url: string;
  shareText: string;
  /** Absolute URL of the OG image, used as the Pinterest pin media. */
  ogImageUrl: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [hasNativeShare, setHasNativeShare] = useState(false);

  useEffect(() => {
    setHasNativeShare(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function",
    );
  }, []);

  const twitterHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const pinterestHref = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(ogImageUrl)}&description=${encodeURIComponent(shareText)}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: "frockd · tools",
        text: shareText,
        url,
      });
    } catch {
      // User cancelled or browser threw — silent. Other buttons remain.
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <input
        type="text"
        value={url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--hairline)",
          background: "var(--surface-sunken)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--ink-1)",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <ShareButton
          onClick={copy}
          accent="#1c1816"
          textColor="#fff"
        >
          {copyState === "copied"
            ? "✓ Copied"
            : copyState === "failed"
              ? "Try again"
              : "Copy link"}
        </ShareButton>
        <ShareLink href={twitterHref} accent="#000000" textColor="#fff">
          Post on X
        </ShareLink>
        <ShareLink href={pinterestHref} accent="#E60023" textColor="#fff">
          Pin it
        </ShareLink>
        <ShareLink href={waHref} accent="#25D366" textColor="#fff">
          WhatsApp
        </ShareLink>
        {hasNativeShare && (
          <ShareButton
            onClick={nativeShare}
            accent="var(--surface)"
            textColor="var(--ink-1)"
            outline
          >
            More…
          </ShareButton>
        )}
      </div>
      <details
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          marginTop: 4,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: 11,
            color: "var(--ink-3)",
          }}
        >
          Pre-written blurb (click to expand)
        </summary>
        <textarea
          readOnly
          rows={3}
          value={shareText}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--hairline)",
            background: "var(--surface-sunken)",
            fontFamily: "inherit",
            fontSize: 13,
            color: "var(--ink-2)",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </details>
    </div>
  );
}

type Common = { accent: string; textColor: string; outline?: boolean };

function buttonStyle(s: Common): React.CSSProperties {
  return {
    flex: "1 1 auto",
    minWidth: 110,
    padding: "10px 16px",
    borderRadius: 999,
    background: s.outline ? "transparent" : s.accent,
    color: s.textColor,
    border: s.outline ? "1px solid var(--hairline-strong)" : 0,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  };
}

function ShareButton({
  onClick,
  children,
  ...style
}: Common & { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={buttonStyle(style)}>
      {children}
    </button>
  );
}

function ShareLink({
  href,
  children,
  ...style
}: Common & { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={buttonStyle(style)}
    >
      {children}
    </a>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * One-tap referral sharing. Renders the bare link in an input
 * (people still want to see it), plus a row of share targets:
 * - Copy link (clipboard)
 * - WhatsApp (https://wa.me/?text=)
 * - SMS (sms:?body= — works on iOS/Android)
 * - Native Share sheet (Web Share API) when the platform offers it
 *
 * Pre-filled text is intentionally short and personal. The bare
 * link by itself triggers the OG preview card in chat apps that
 * support it (the rich-preview upgrade is a follow-up).
 */
export function ReferralLinkCopier({
  url,
  code,
}: {
  url: string;
  code: string;
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

  const shareText = `I've been selling dresses on frockd — pretty painless and the money's real. Worth a look:`;
  const shareWithLink = `${shareText} ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareWithLink)}`;
  // iOS prefers `&body=` after `sms:?`; Android accepts both. The
  // empty number after `sms:?` opens the picker rather than
  // pre-selecting a recipient.
  const smsHref = `sms:?&body=${encodeURIComponent(shareWithLink)}`;

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
        title: "Join me on frockd",
        text: shareText,
        url,
      });
    } catch {
      // User cancelled, or browser threw — silent. The other
      // buttons remain a viable alternative.
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
          aria-label="Copy referral link to clipboard"
        >
          {copyState === "copied"
            ? "✓ Copied"
            : copyState === "failed"
              ? "Try again"
              : "Copy link"}
        </ShareButton>
        <ShareLink
          href={waHref}
          accent="#25D366"
          textColor="#fff"
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp
        </ShareLink>
        <ShareLink href={smsHref} accent="#0a84ff" textColor="#fff">
          SMS
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
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Code: {code}
      </span>
    </div>
  );
}

function buttonStyle(
  accent: string,
  textColor: string,
  outline?: boolean,
): React.CSSProperties {
  return {
    flex: "1 1 auto",
    minWidth: 110,
    padding: "10px 16px",
    borderRadius: 999,
    background: outline ? "transparent" : accent,
    color: textColor,
    border: outline ? "1px solid var(--hairline-strong)" : 0,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "filter 150ms",
    boxSizing: "border-box",
  };
}

function ShareButton({
  onClick,
  accent,
  textColor,
  outline,
  children,
}: {
  onClick: () => void;
  accent: string;
  textColor: string;
  outline?: boolean;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={buttonStyle(accent, textColor, outline)}
    >
      {children}
    </button>
  );
}

function ShareLink({
  href,
  accent,
  textColor,
  target,
  rel,
  children,
}: {
  href: string;
  accent: string;
  textColor: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target={target} rel={rel} style={buttonStyle(accent, textColor)}>
      {children}
    </a>
  );
}

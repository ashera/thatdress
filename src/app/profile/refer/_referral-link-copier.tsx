"use client";

import { useState } from "react";

/**
 * Inline display + copy-to-clipboard for the referrer's URL. Shows the
 * full URL in a monospace input for transparency, plus a primary
 * 'Copy link' button that flips to 'Copied' for 2s after success.
 * Falls back to a manual select-all on the input if the Clipboard
 * API isn't available (older browsers, insecure contexts).
 */
export function ReferralLinkCopier({
  url,
  code,
}: {
  url: string;
  code: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
      window.setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <input
        type="text"
        value={url}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        style={{
          flex: "1 1 280px",
          minWidth: 0,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--hairline)",
          background: "var(--surface-sunken)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--ink-1)",
        }}
      />
      <button
        type="button"
        onClick={copy}
        style={{
          padding: "10px 18px",
          borderRadius: 999,
          background: state === "copied" ? "#16a34a" : "var(--ink-1)",
          color: "#fff",
          border: 0,
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
          transition: "background 150ms",
          minWidth: 110,
        }}
      >
        {state === "copied"
          ? "✓ Copied"
          : state === "failed"
          ? "Try again"
          : "Copy link"}
      </button>
      <span
        style={{
          flex: "1 1 100%",
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

"use client";

import { useState } from "react";

/**
 * Caption + hashtag composer for the Instagram post page. Renders
 * an editable textarea pre-filled with the generated caption and a
 * one-click 'Copy caption' button. Admins edit before copying;
 * the parent server form bakes the final value into the
 * hidden 'caption' field of the log-post action via the textarea's
 * defaultValue (DOM state).
 *
 * Kept client-only because the copy-to-clipboard interaction
 * needs navigator.clipboard and useState for the 'Copied' flash.
 */
export function CaptionCopier({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
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
        flexDirection: "column",
        gap: 10,
      }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={12}
        maxLength={2200}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 8,
          border: "1px solid var(--hairline)",
          background: "var(--surface-sunken)",
          fontFamily: "inherit",
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--ink-1)",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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
            minWidth: 140,
          }}
        >
          {state === "copied"
            ? "✓ Copied"
            : state === "failed"
              ? "Try again"
              : "Copy caption"}
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-3)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {value.length} / 2200 characters
        </span>
      </div>
    </div>
  );
}

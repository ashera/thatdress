"use client";

import { useEffect, useRef, useState } from "react";
import {
  TRUST_BADGE_LABELS,
  type TrustStatus,
} from "@/lib/listing-trust";

export type TrustBadgeProps = {
  status: TrustStatus | undefined;
  /** Visual size of the pill. Card uses "small"; detail page "large". */
  size?: "small" | "large";
};

/**
 * Clickable trust pill. Opens a small dialog explaining what the
 * status means and how a listing earns it. Renders nothing for the
 * default 'self-declared' / 'flagged' states so the only badges
 * users see are the ones with affirmative meaning.
 */
export function TrustBadge({ status, size = "small" }: TrustBadgeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Track open state so we can wire ESC and click-outside cleanup.
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onClose() {
      setIsOpen(false);
    }
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [isOpen]);

  if (!status || status === "self-declared" || status === "flagged") {
    return null;
  }

  const isAuthenticated = status === "authenticated";
  const label = TRUST_BADGE_LABELS[status];

  const baseStyles = isAuthenticated
    ? {
        background: "#1c1816",
        color: "#fff",
        border: "1px solid #1c1816",
      }
    : {
        background: "#fef3c7", // gold tint
        color: "#92400e", // dark amber
        border: "1px solid #fcd34d",
      };

  const sizeStyles =
    size === "large"
      ? {
          padding: "6px 14px",
          fontSize: 12,
          gap: 8,
          iconSize: 14,
        }
      : {
          padding: "3px 8px",
          fontSize: 10,
          gap: 4,
          iconSize: 11,
        };

  function open() {
    setIsOpen(true);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
    setIsOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="What does this badge mean?"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: sizeStyles.gap,
          padding: sizeStyles.padding,
          borderRadius: 999,
          fontFamily: "var(--font-mono)",
          fontSize: sizeStyles.fontSize,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          cursor: "pointer",
          ...baseStyles,
        }}
      >
        <span aria-hidden style={{ fontSize: sizeStyles.iconSize, lineHeight: 1 }}>
          {isAuthenticated ? "★" : "✓"}
        </span>
        {label}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          // Close on backdrop click. The <dialog> element itself fills
          // the whole viewport when modal; clicks on the content stop
          // here, clicks on the backdrop hit the dialog itself.
          if (e.target === dialogRef.current) close();
        }}
        style={{
          padding: 0,
          border: 0,
          borderRadius: 14,
          maxWidth: 480,
          width: "calc(100% - 32px)",
          background: "var(--surface)",
          color: "var(--ink-1)",
          boxShadow: "var(--e-4)",
        }}
      >
        <div style={{ padding: "var(--s-6) var(--s-7)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              ...baseStyles,
            }}
          >
            <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
              {isAuthenticated ? "★" : "✓"}
            </span>
            {label}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
              color: "var(--ink-1)",
              margin: "var(--s-3) 0 var(--s-2)",
            }}
          >
            {isAuthenticated
              ? "What does Authenticated mean?"
              : "What does Verified mean?"}
          </h2>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {isAuthenticated
              ? "An authentication partner has confirmed this dress is the genuine article. Authenticated listings get the highest level of buyer protection on frockd."
              : "Verified listings have met every basic check that separates a real, well-described listing from a sketchy one. They sell faster and tend to attract more confident buyers."}
          </p>

          {!isAuthenticated && (
            <>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  letterSpacing: "-0.005em",
                  margin: "var(--s-5) 0 var(--s-3)",
                  color: "var(--ink-1)",
                }}
              >
                How a listing earns it
              </h3>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--s-3)",
                  fontSize: 14,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                }}
              >
                <CheckItem
                  title="Authenticity confirmed by the seller"
                  desc="They've ticked the authenticity box at publish. Knowingly listing a counterfeit removes the badge — and the listing."
                />
                <CheckItem
                  title="Label + lining photos included"
                  desc="The seller has confirmed the listing photos include a designer-label close-up and a lining / wrong-side shot — the two angles buyers use to spot fakes."
                />
                <CheckItem
                  title="At least 3 photos uploaded"
                  desc="Enough angles to evaluate the dress without messaging the seller."
                />
                <CheckItem
                  title="Listing health score above the threshold"
                  desc="The listing's health score (a 0–100 measure of completeness across designer, condition, measurements, retail price, and description) is high enough."
                />
              </ul>
            </>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "var(--s-6)",
            }}
          >
            <button
              type="button"
              onClick={close}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                background: "var(--ink-1)",
                color: "#fff",
                border: 0,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function CheckItem({ title, desc }: { title: string; desc: string }) {
  return (
    <li
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fef3c7",
          color: "#92400e",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          marginTop: 1,
        }}
      >
        ✓
      </span>
      <span style={{ display: "block" }}>
        <strong style={{ color: "var(--ink-1)" }}>{title}</strong>
        <span
          style={{
            display: "block",
            color: "var(--ink-3)",
            marginTop: 2,
          }}
        >
          {desc}
        </span>
      </span>
    </li>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { closeListingWithBuyer } from "@/lib/actions/reviews";

export type BuyerOption = {
  /** users.id of the buyer (string for safe template-literal use). */
  id: string;
  /** Their email address — masked in the dropdown for privacy. */
  email: string;
  /** Number of messages exchanged on this listing's conversation, so
   *  the seller has signal beyond just the email when picking. */
  messageCount: number;
};

/**
 * 'Mark as sold' dialog. Replaces the previous one-click toggleSold
 * form on the detail page and the SaleNudgeBanner. Opens a small
 * dialog with two paths:
 *
 * - 'Sold to a frockd buyer' → seller picks from a list of every
 *   user who's had a conversation about this listing. Submitting
 *   stamps sold_to_user_id and triggers the review-prompt email.
 * - 'Sold elsewhere' → no buyer picked, no review email — just
 *   closes the listing.
 *
 * Either path then redirects to the form's `next` (default
 * /listings/mine) so the seller sees their dashboard reflect the
 * sale.
 */
export function MarkSoldDialog({
  listingId,
  buyers,
  next = "/listings/mine",
  buttonLabel = "Mark as sold",
  buttonVariant = "ghost",
}: {
  listingId: string;
  buyers: BuyerOption[];
  next?: string;
  buttonLabel?: string;
  /** 'ghost' for in-banner / detail-page action-row use, 'dark' if
   *  the caller wants a higher-contrast trigger. */
  buttonVariant?: "ghost" | "dark";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"frockd" | "elsewhere">(
    buyers.length > 0 ? "frockd" : "elsewhere",
  );

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onClose() {
      setOpen(false);
    }
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [open]);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
  }

  const baseStyle =
    buttonVariant === "dark"
      ? {
          padding: "6px 14px",
          borderRadius: 999,
          background: "var(--ink-1)",
          color: "#fff",
          border: "1px solid var(--ink-1)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          lineHeight: 1.4,
        }
      : {
          padding: "6px 14px",
          borderRadius: 999,
          background: "transparent",
          color: "var(--ink-2)",
          border: "1px solid var(--hairline-strong)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          lineHeight: 1.4,
        };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        style={baseStyle}
      >
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeDialog();
        }}
        style={{
          padding: 0,
          border: 0,
          borderRadius: 14,
          maxWidth: 520,
          width: "calc(100% - 32px)",
          background: "var(--surface)",
          color: "var(--ink-1)",
          boxShadow: "var(--e-4)",
        }}
      >
        <form action={closeListingWithBuyer}>
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="next" value={next} />

          <div style={{ padding: "var(--s-6) var(--s-7)" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
                color: "var(--ink-1)",
                margin: "0 0 var(--s-2)",
              }}
            >
              Mark this dress sold
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 var(--s-4)",
              }}
            >
              Did you sell it through frockd? Picking the buyer lets us
              ask them for a quick review — those reviews live on your
              public seller profile and help future buyers trust you.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginBottom: "var(--s-4)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  border: `1px solid ${mode === "frockd" ? "var(--ink-1)" : "var(--hairline)"}`,
                  borderRadius: 10,
                  cursor: buyers.length > 0 ? "pointer" : "not-allowed",
                  opacity: buyers.length > 0 ? 1 : 0.5,
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="radio"
                  name="_mode"
                  value="frockd"
                  checked={mode === "frockd"}
                  onChange={() => setMode("frockd")}
                  disabled={buyers.length === 0}
                  style={{ marginTop: 4 }}
                />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: "block" }}>
                    Sold to a frockd buyer
                  </strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: "var(--ink-3)",
                      marginTop: 2,
                      marginBottom: mode === "frockd" ? 8 : 0,
                    }}
                  >
                    {buyers.length === 0
                      ? "No conversations on this listing yet."
                      : "Pick the buyer from your conversations on this listing."}
                  </span>
                  {mode === "frockd" && buyers.length > 0 && (
                    <select
                      name="buyerId"
                      required
                      defaultValue=""
                      className="input"
                      style={{ width: "100%", marginTop: 4 }}
                    >
                      <option value="" disabled>
                        Select a buyer…
                      </option>
                      {buyers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {maskEmail(b.email)} — {b.messageCount}{" "}
                          message{b.messageCount === 1 ? "" : "s"}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
              </label>

              <label
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  border: `1px solid ${mode === "elsewhere" ? "var(--ink-1)" : "var(--hairline)"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="radio"
                  name="_mode"
                  value="elsewhere"
                  checked={mode === "elsewhere"}
                  onChange={() => setMode("elsewhere")}
                  style={{ marginTop: 4 }}
                />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: "block" }}>
                    Sold elsewhere
                  </strong>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      color: "var(--ink-3)",
                      marginTop: 2,
                    }}
                  >
                    The dress sold off-platform. We&rsquo;ll just close
                    the listing — no review email.
                  </span>
                </span>
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={closeDialog}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--ink-2)",
                  border: "1px solid var(--hairline-strong)",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
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
                Confirm sale
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"●".repeat(Math.max(2, local.length - 2))}${domain}`;
}

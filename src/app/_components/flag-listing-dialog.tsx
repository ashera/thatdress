"use client";

import { useEffect, useRef, useState } from "react";
import { setListingTrustStatus } from "@/lib/actions/listing-trust";

const REASON_MAX = 500;

type FlagListingDialogProps = {
  listingId: string;
  /** Where the action should redirect to on success — 'detail' (default)
   *  redirects to /listings/{id}, 'queue' redirects to /admin/listings/flagged. */
  next?: "detail" | "queue";
  /** Button label override. Defaults to "Flag for review". */
  label?: string;
};

/**
 * Admin-only flag-with-reason dialog. The bare button matches the small
 * action-row styling on the detail page; clicking opens a native
 * <dialog> with a textarea where the admin types the reason. Submitting
 * the form posts to setListingTrustStatus, which writes both the
 * listings.trust_status update *and* a new row to listing_flags so we
 * have an audit trail.
 */
export function FlagListingDialog({
  listingId,
  next = "detail",
  label = "Flag for review",
}: FlagListingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

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

  const remaining = REASON_MAX - reason.length;
  const canSubmit = reason.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          background: "transparent",
          color: "var(--ink-3)",
          border: "1px solid var(--hairline-strong)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {label}
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
        <form action={setListingTrustStatus}>
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="status" value="flagged" />
          <input
            type="hidden"
            name="next"
            value={next === "queue" ? "queue" : "detail"}
          />
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
              Flag this listing for review
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 var(--s-4)",
              }}
            >
              Tell us what looks off. The reason gets stored against the
              listing along with your username and the time, so whoever
              picks up the review has context to investigate.
            </p>
            <label
              htmlFor="flag-reason"
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                marginBottom: 6,
              }}
            >
              Reason
            </label>
            <textarea
              id="flag-reason"
              name="reason"
              required
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. Photos look stolen from a designer's site; seller's other listings are also suspicious."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--hairline)",
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.5,
                color: "var(--ink-1)",
                background: "var(--surface)",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                fontSize: 12,
                color: remaining < 50 ? "var(--ink-2)" : "var(--ink-4)",
                marginTop: 4,
                textAlign: "right",
              }}
            >
              {remaining} characters left
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: "var(--s-5)",
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
                disabled={!canSubmit}
                style={{
                  padding: "10px 22px",
                  borderRadius: 999,
                  background: canSubmit ? "var(--ink-1)" : "var(--ink-4)",
                  color: "#fff",
                  border: 0,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                Flag listing
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { submitBuyerListingFlag } from "@/lib/actions/listing-trust";

const REASON_MAX = 500;

/**
 * Buyer-facing 'Report this listing' dialog. Mirrors the structure of
 * FlagListingDialog but posts to submitBuyerListingFlag — which writes
 * a listing_flags audit-trail row WITHOUT changing trust_status. An
 * admin reviews the report from /admin/listings/flagged and decides
 * whether to elevate to flagged or dismiss.
 */
export function ReportListingDialog({
  listingId,
}: {
  listingId: string;
}) {
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
        title="Tell us if something looks off about this listing"
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
        Report listing
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
        <form action={submitBuyerListingFlag}>
          <input type="hidden" name="listingId" value={listingId} />
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
              Report this listing
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 var(--s-4)",
              }}
            >
              See something off — photos that look stolen, the dress
              looks like a knock-off, the description is dishonest?
              Tell us what caught your eye and the frockd team will
              take a look. Your report stays private; the seller
              isn&rsquo;t notified.
            </p>
            <label
              htmlFor="report-reason"
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
              What looks off?
            </label>
            <textarea
              id="report-reason"
              name="reason"
              required
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. Reverse image search shows these photos on a designer's website."
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
                Submit report
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { flagSellerReview } from "@/lib/actions/reviews";

const REASON_MAX = 500;

/**
 * Seller-only 'Flag this review' dialog. Visible on the seller's own
 * profile next to each review they've received. Opens a small dialog
 * with a reason textarea; submitting writes flagged_at + flag_reason
 * on the listing_reviews row, which surfaces it in the admin
 * moderation queue at /admin/reviews. The review stays publicly
 * visible until an admin acts on it — flagging is a request for
 * review, not an automatic hide.
 */
export function FlagReviewDialog({ reviewId }: { reviewId: string }) {
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
        title="Tell us why this review is unfair"
        style={{
          padding: "3px 10px",
          borderRadius: 999,
          background: "transparent",
          color: "var(--ink-3)",
          border: "1px solid var(--hairline)",
          fontWeight: 600,
          fontSize: 11,
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Flag this review
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
        <form action={flagSellerReview}>
          <input type="hidden" name="reviewId" value={reviewId} />
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
              Flag this review
            </h2>
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 var(--s-4)",
              }}
            >
              Tell us why this review feels unfair — wrong facts,
              spite, mistaken identity, anything else. The frockd
              team reads every flagged review and decides whether to
              keep it on your profile or hide it. The buyer
              isn&rsquo;t notified.
            </p>
            <label
              htmlFor="flag-review-reason"
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
              What&rsquo;s off?
            </label>
            <textarea
              id="flag-review-reason"
              name="reason"
              required
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. The buyer never picked the dress up — they ghosted me on the day. The 'didn't show' isn't accurate."
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
                Submit flag
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}

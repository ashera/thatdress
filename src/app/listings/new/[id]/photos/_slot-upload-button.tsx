"use client";

import { useRef, useState } from "react";

/**
 * Single-click upload trigger. Renders a hidden file input plus a
 * visible button; clicking the button opens the native file picker,
 * and selecting a file (or files) submits the surrounding form
 * immediately. No separate 'Upload' tap required.
 *
 * Used both for the four verification slot panels (single file,
 * name="image") and the extras uploader at the bottom of the card
 * (multi-file, name="images") — the props let either form opt in.
 */
export function SlotUploadButton({
  hasExisting = false,
  multiple = false,
  inputName = "image",
  label,
  variant,
}: {
  /** Slot already has a photo — flips the default label to "Replace photo"
   *  and the styling to ghost. Ignored when `label` / `variant` set explicitly. */
  hasExisting?: boolean;
  /** Allow multi-file selection. Match form field name to
   *  collectImageFiles() expectation in the server action. */
  multiple?: boolean;
  /** Form field name for the file input. */
  inputName?: string;
  /** Override the auto-derived button label. */
  label?: string;
  /** Override the auto-derived button styling. */
  variant?: "primary" | "ghost";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedLabel =
    label ?? (hasExisting ? "Replace photo" : "Upload photo");
  const resolvedVariant: "primary" | "ghost" =
    variant ?? (hasExisting ? "ghost" : "primary");
  const buttonStyle =
    resolvedVariant === "ghost"
      ? {
          background: "transparent",
          color: "var(--ink-2)",
          border: "1px solid var(--hairline-strong)",
        }
      : {
          background: "var(--ink-1)",
          color: "#fff",
          border: "1px solid var(--ink-1)",
        };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        name={inputName}
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => {
          if (!e.currentTarget.files || e.currentTarget.files.length === 0) {
            return;
          }
          setSubmitting(true);
          // Submit the parent form so the server action runs with
          // its hidden listingId / role fields plus the picked file(s).
          // requestSubmit() respects form validation; submit() doesn't.
          e.currentTarget.form?.requestSubmit();
        }}
      />
      <button
        type="button"
        disabled={submitting}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 13,
          cursor: submitting ? "wait" : "pointer",
          opacity: submitting ? 0.6 : 1,
          ...buttonStyle,
        }}
      >
        {submitting ? "Uploading…" : resolvedLabel}
      </button>
    </>
  );
}

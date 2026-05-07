"use client";

import { useRef, useState } from "react";

/**
 * Single-click upload trigger. Renders a hidden file input plus one
 * or two visible buttons; clicking the button opens the native file
 * picker (or camera, on mobile, when showCamera is set) and selecting
 * a file submits the surrounding form immediately. No separate
 * 'Upload' tap required.
 *
 * Used both for the four verification slot panels (single file,
 * name="image", with the camera shortcut enabled) and the extras
 * uploader at the bottom of the card (multi-file, name="images",
 * camera disabled — capture+multiple is awkward UX). The props let
 * each form opt in.
 */
export function SlotUploadButton({
  hasExisting = false,
  multiple = false,
  inputName = "image",
  label,
  variant,
  showCamera = false,
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
  /** Render a sibling 'Take photo' button that opens the rear camera
   *  directly on mobile. Falls back to the regular file picker on
   *  desktop, where the `capture` attribute is ignored by browsers. */
  showCamera?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const resolvedLabel =
    label ?? (hasExisting ? "Replace photo" : "Upload photo");
  const resolvedVariant: "primary" | "ghost" =
    variant ?? (hasExisting ? "ghost" : "primary");
  const primaryStyle =
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
  const ghostStyle = {
    background: "transparent",
    color: "var(--ink-2)",
    border: "1px solid var(--hairline-strong)",
  };

  function trigger(useCamera: boolean) {
    const input = inputRef.current;
    if (!input) return;
    // Toggle the capture attribute right before opening the picker so
    // a single hidden input serves both flows. 'environment' = rear
    // camera; mobile browsers open the camera UI directly. Desktop
    // browsers ignore capture and behave like a normal file picker.
    if (useCamera) {
      input.setAttribute("capture", "environment");
    } else {
      input.removeAttribute("capture");
    }
    input.click();
  }

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
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={submitting}
          onClick={() => trigger(false)}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 13,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.6 : 1,
            ...primaryStyle,
          }}
        >
          {submitting ? "Uploading…" : resolvedLabel}
        </button>
        {showCamera && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => trigger(true)}
            title="Open the camera to take this photo now"
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 13,
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.6 : 1,
              ...ghostStyle,
            }}
          >
            <span aria-hidden style={{ marginRight: 4 }}>
              📷
            </span>
            Take photo
          </button>
        )}
      </div>
    </>
  );
}

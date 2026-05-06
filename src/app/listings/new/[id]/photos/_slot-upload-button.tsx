"use client";

import { useRef, useState } from "react";

/**
 * Single-click upload trigger for a photo slot. Renders a hidden
 * file input + a visible button; clicking the button opens the
 * native file picker, and selecting a file submits the surrounding
 * form immediately. No separate 'Upload' tap required.
 *
 * Lives inside the parent server-rendered <form action={serverAction}>
 * — that form already carries the listingId / role hidden fields and
 * the encType="multipart/form-data" the action expects.
 */
export function SlotUploadButton({
  hasExisting,
}: {
  hasExisting: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          if (!e.currentTarget.files || e.currentTarget.files.length === 0) {
            return;
          }
          setSubmitting(true);
          // Submit the parent form so the server action runs with
          // listingId / role / image all together. requestSubmit() is
          // the modern equivalent that respects form validation.
          e.currentTarget.form?.requestSubmit();
        }}
      />
      <button
        type="button"
        disabled={submitting}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          background: hasExisting ? "transparent" : "var(--ink-1)",
          color: hasExisting ? "var(--ink-2)" : "#fff",
          border: hasExisting
            ? "1px solid var(--hairline-strong)"
            : "1px solid var(--ink-1)",
          fontWeight: 600,
          fontSize: 13,
          cursor: submitting ? "wait" : "pointer",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting
          ? "Uploading…"
          : hasExisting
          ? "Replace photo"
          : "Upload photo"}
      </button>
    </>
  );
}

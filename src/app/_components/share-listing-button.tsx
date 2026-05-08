"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share button + share sheet for a listing detail page. Two paths:
 *
 * - On mobile (and any browser exposing navigator.share), tapping the
 *   button calls the OS share sheet directly — Instagram, iMessage,
 *   WhatsApp, Mail, AirDrop, whatever the user has set up.
 * - Everywhere else (desktop browsers without Web Share, Firefox at
 *   the time of writing), we open a native <dialog> with a copy-link
 *   row and a strip of social share buttons that pop the standard
 *   share-via-URL endpoints in a new tab.
 *
 * The component is route-agnostic — `url` and `title` are passed in
 * by the page so the same button works for any future surface that
 * needs sharing (a seller profile, a saved-search result, etc.).
 */
export function ShareListingButton({
  url,
  title,
  shareText,
}: {
  url: string;
  /** Used as the share sheet's headline AND fed to the social-share
   *  URLs. Keep it short — most platforms truncate around 80 chars. */
  title: string;
  /** Optional 1-line marketing line included in iMessage / Twitter /
   *  email copy. Defaults to a short pitch. */
  shareText?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [hasNativeShare, setHasNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHasNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

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

  const text = shareText ?? "Found this on frockd:";

  async function handleClick() {
    if (hasNativeShare) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User dismissed, or the platform refused — fall through to
        // the in-app sheet so we still give them a way to share.
      }
    }
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused — leave the input there for manual copy.
    }
  }

  const enc = encodeURIComponent;
  const socials = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    },
    {
      label: "X / Twitter",
      href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
    },
    {
      label: "Email",
      href: `mailto:?subject=${enc(title)}&body=${enc(`${text}\n\n${url}`)}`,
    },
  ];

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Share this listing"
        style={{
          padding: "6px 14px",
          borderRadius: 999,
          background: "transparent",
          color: "var(--ink-2)",
          border: "1px solid var(--hairline-strong)",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden>↗</span>
        Share
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
          maxWidth: 480,
          width: "calc(100% - 32px)",
          background: "var(--surface)",
          color: "var(--ink-1)",
          boxShadow: "var(--e-4)",
        }}
      >
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
            Share this listing
          </h2>
          <p
            style={{
              color: "var(--ink-3)",
              fontSize: 14,
              lineHeight: 1.5,
              margin: "0 0 var(--s-4)",
            }}
          >
            Copy the link or send it via your favourite app.
          </p>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: "var(--s-4)",
            }}
          >
            <input
              type="text"
              value={url}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              style={{
                flex: "1 1 auto",
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
              onClick={copyLink}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                background: copied ? "#16a34a" : "var(--ink-1)",
                color: "#fff",
                border: 0,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                minWidth: 100,
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 8,
            }}
          >
            {socials.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-1)",
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "var(--s-5)",
            }}
          >
            <button
              type="button"
              onClick={closeDialog}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                background: "transparent",
                color: "var(--ink-2)",
                border: "1px solid var(--hairline-strong)",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";

type ExampleRole = "front" | "back" | "label" | "lining";

type Example = {
  role: ExampleRole;
  label: string;
  fallbackImg: string;
  why: string;
};

const EXAMPLES: Example[] = [
  {
    role: "front",
    label: "1. Full-length front",
    fallbackImg: "/seamstress-formal-front.jpg",
    why: "This is the photo buyers see first — in browse results, search, on Pinterest, on Instagram. It's the shot they decide on. Show the whole dress against a plain wall in soft daylight; full silhouette, no clutter, no shadows across the bodice. A well-lit front shot more than doubles the click-through rate vs a phone-flash mirror selfie.",
  },
  {
    role: "back",
    label: "2. Back",
    fallbackImg: "/seamstress-formal-back.jpg",
    why: "Skipping the back makes buyers wonder what you're hiding. Most formal dresses are designed front *and* back — the closures, drape, low cut-out or train detail are often what sells the dress. Buyers who can see the back imagine the whole look; buyers who can't, scroll past.",
  },
  {
    role: "label",
    label: "3. Designer label",
    fallbackImg: "/seamstress-formal-label.jpg",
    why: "Designer labels are the single most-asked-about question in buyer messages (\"is this really X?\"). Show it upfront and you cut the back-and-forth in half — buyers can confirm the brand without having to ask. It's also a Verified-badge requirement, so a clear label shot lifts your listing into a more trusted tier on the home page.",
  },
  {
    role: "lining",
    label: "4. Lining / wrong-side",
    fallbackImg: "/seamstress-formal-lining.jpg",
    why: "Counterfeits fail the inside test more often than the outside. Lining stitching, brand-stamped linings, and the overall construction signal you have a genuine garment — sloppy edges and printed-on labels signal you don't. Buyers who've been burned before know to ask for this; sellers who provide it upfront close faster.",
  },
];

export type PhotoExampleSource = {
  listingId: string;
  /** Map of role → image id from listing_images. Missing roles fall
   *  back to the local seamstress illustration. */
  images: Partial<Record<ExampleRole, string>>;
};

export function PhotoExamplesDialog({
  source,
}: {
  source: PhotoExampleSource | null;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  function open() {
    dialogRef.current?.showModal();
  }

  // Close when the user clicks the dimmed backdrop (everywhere
  // outside the dialog box itself).
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("click", onClick);
    return () => d.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "transparent",
          border: "1px solid var(--hairline-strong, #d4d4d4)",
          borderRadius: 999,
          color: "var(--ink-2)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span aria-hidden style={{ fontSize: 13 }}>📸</span>
        Show me an example
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="photo-examples-title"
        style={{
          border: "none",
          padding: 0,
          borderRadius: 16,
          maxWidth: "min(960px, 92vw)",
          width: "100%",
          maxHeight: "92vh",
          background: "var(--surface, #fff)",
          color: "var(--ink-1, #1c1816)",
          boxShadow: "0 30px 60px -16px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "20px 24px 12px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: 0,
              }}
            >
              Photo guide
            </p>
            <h2
              id="photo-examples-title"
              style={{
                fontFamily: "var(--font-display, var(--font-sans))",
                fontSize: 22,
                margin: "4px 0 0",
                letterSpacing: "-0.02em",
                color: "var(--ink-1)",
              }}
            >
              The four shots that matter most — and why
            </h2>
          </div>
          <form method="dialog" style={{ margin: 0 }}>
            <button
              type="submit"
              aria-label="Close"
              style={{
                width: 36,
                height: 36,
                border: "1px solid var(--hairline)",
                borderRadius: "50%",
                background: "var(--surface)",
                color: "var(--ink-2)",
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                flex: "0 0 auto",
              }}
            >
              ✕
            </button>
          </form>
        </div>

        <div
          style={{
            overflowY: "auto",
            maxHeight: "calc(92vh - 64px - 64px)",
            padding: "16px 24px",
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: "var(--ink-2)",
              lineHeight: 1.5,
              marginTop: 0,
              marginBottom: 20,
            }}
          >
            Buyers scroll fast. A listing with all four shots converts
            roughly three times more clicks into messages than one with
            just a front-on. Here's what each shot is doing for you —
            and what the perfect version looks like.
          </p>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {EXAMPLES.map((ex) => {
              const sourceImgId = source?.images[ex.role];
              const imgSrc =
                source && sourceImgId
                  ? `/api/listings/${source.listingId}/images/${sourceImgId}?w=600`
                  : ex.fallbackImg;
              return (
              <li
                key={ex.role}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 220px) 1fr",
                  gap: 16,
                  alignItems: "start",
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "3 / 4",
                    width: "100%",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--hairline)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc}
                    alt={`Example ${ex.label} photo`}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: "0 0 6px",
                      fontSize: 16,
                      fontWeight: 700,
                      color: "var(--ink-1)",
                    }}
                  >
                    {ex.label}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: "var(--ink-2)",
                    }}
                  >
                    {ex.why}
                  </p>
                </div>
              </li>
              );
            })}
          </ul>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "12px 24px 20px",
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <form method="dialog" style={{ margin: 0 }}>
            <button
              type="submit"
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                background: "var(--ink-1)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Got it
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}

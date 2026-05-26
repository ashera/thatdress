"use client";

import { useEffect, useRef, useState } from "react";
import { toggleShortlist } from "@/lib/actions/shortlist";
import { Icon } from "./ui";

/**
 * Heart button + transient "Added to Favourites" toast.
 *
 * The server action revalidates the listings paths after toggling,
 * so the `isShortlisted` prop changes on the next render. The hook
 * watches for a false→true transition and shows a toast for ~2.4s;
 * removing a favourite is silent (no toast on the way out).
 */
export function FavouriteToggle({
  listingId,
  isShortlisted,
  variant,
  nextPath,
}: {
  listingId: string;
  isShortlisted: boolean;
  variant: "card" | "row";
  nextPath: string;
}) {
  const [showToast, setShowToast] = useState(false);
  const prevRef = useRef(isShortlisted);

  useEffect(() => {
    if (!prevRef.current && isShortlisted) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 2400);
      prevRef.current = isShortlisted;
      return () => clearTimeout(t);
    }
    prevRef.current = isShortlisted;
  }, [isShortlisted]);

  return (
    <>
      <form action={toggleShortlist} className="shortlist-form">
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="next" value={nextPath} />
        <button
          type="submit"
          className={`shortlist-btn ${variant === "row" ? "is-row" : ""} ${
            isShortlisted ? "is-on" : ""
          }`}
          aria-label={
            isShortlisted ? "Remove from favourites" : "Add to favourites"
          }
          title={
            isShortlisted ? "Remove from favourites" : "Add to favourites"
          }
        >
          <Icon name="heart" size="sm" />
        </button>
      </form>

      {showToast && <FavouriteToast />}
    </>
  );
}

function FavouriteToast() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 32,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        background: "var(--ink-1)",
        color: "#fff",
        borderRadius: 999,
        fontWeight: 600,
        fontSize: 14,
        boxShadow: "0 12px 28px -8px rgba(0,0,0,0.45)",
        animation: "favourite-toast-pop 240ms ease-out",
        pointerEvents: "none",
      }}
    >
      <span aria-hidden style={{ color: "#f9a8d4", fontSize: 16 }}>
        ♥
      </span>
      Added to Favourites
      <style>{`
        @keyframes favourite-toast-pop {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./ui";

export function AvatarMenu({
  email,
  name,
  tierEmoji,
  tierLabel,
  children,
}: {
  email: string;
  name?: string | null;
  /** Referral-tier emoji to render right of the name — null when
   *  the user hasn't reached the first tier yet. */
  tierEmoji?: string | null;
  /** Human label for the tier, surfaced on hover. */
  tierLabel?: string | null;
  children: ReactNode;
}) {
  const displayName =
    name && name.trim().length > 0
      ? name.trim()
      : email.split("@")[0] ?? email;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Element | null;
      if (!target) return;
      if (!el.contains(target)) setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Element | null;
      if (!target || !el.contains(target)) return;
      if (target.closest(".avatar-toggle")) return;
      if (target.closest("a, button")) {
        setTimeout(() => setOpen(false), 0);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={`avatar-menu ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="avatar-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        title={email}
      >
        <Icon name="user" />
        <span className="avatar-name">{displayName}</span>
        {tierEmoji && (
          <span
            className="avatar-tier"
            aria-label={
              tierLabel
                ? `Referral tier: ${tierLabel}`
                : "Referral tier"
            }
            title={
              tierLabel ? `Referral tier · ${tierLabel}` : "Referral tier"
            }
            style={{
              marginLeft: 4,
              fontSize: "1em",
              lineHeight: 1,
            }}
          >
            {tierEmoji}
          </span>
        )}
      </button>
      <div className="avatar-menu-panel">
        {/* Mobile only: the toggle pill (which shows the name on desktop) is
            hidden in the hamburger panel, so surface the name as a header. */}
        <div className="avatar-menu-name" aria-hidden>
          <Icon name="user" />
          <span>{displayName}</span>
          {tierEmoji && (
            <span style={{ fontSize: "1em", lineHeight: 1 }}>{tierEmoji}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

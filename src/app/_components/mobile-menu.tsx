"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Element | null;
      if (!target) return;

      // Click outside the menu — close.
      if (!el.contains(target)) {
        setOpen(false);
        return;
      }

      // Click on a link or non-toggle button inside — close after the action.
      const isToggle = target.closest(".topbar-toggle");
      if (isToggle) return;
      const isAction = target.closest("a, button");
      if (isAction) setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className={`topbar-menu ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="topbar-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <span className="hamburger" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>
      {children}
    </div>
  );
}

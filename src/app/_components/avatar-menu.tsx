"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function initials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function AvatarMenu({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
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
        {initials(email)}
      </button>
      <div className="avatar-menu-panel">{children}</div>
    </div>
  );
}

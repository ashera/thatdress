"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A table row that navigates to `href` when clicked, for "click the row to
 * open it" admin grids. Clicks that land on an interactive control inside
 * the row (links, buttons, form fields, the details disclosure) are left
 * alone, so per-row actions still work without triggering navigation.
 */
export function ClickableRow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={(e) => {
        const el = e.target as HTMLElement;
        if (
          el.closest("a, button, input, textarea, select, label, summary, details, form")
        ) {
          return;
        }
        router.push(href);
      }}
      style={{ cursor: "pointer" }}
    >
      {children}
    </tr>
  );
}

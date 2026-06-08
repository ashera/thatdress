"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Admin toggle to show/hide seeded sample & test data on the dresses +
 * listings consoles. Default is hidden; checking it sets ?samples=1 while
 * preserving every other query param (search, sort, status, etc.). Server
 * pages read the param via showSamplesFromParam and filter accordingly.
 */
export function SampleDataToggle({ show }: { show: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("samples", "1");
    else params.delete("samples");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      router.refresh();
    });
  }

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid var(--hairline-strong)",
        background: show ? "var(--surface-sunken)" : "var(--surface)",
        fontSize: 13,
        color: "var(--ink-2)",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <input
        type="checkbox"
        checked={show}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>Show sample &amp; test data</span>
      {isPending && (
        <span style={{ color: "var(--ink-4)", fontSize: 11 }}>…</span>
      )}
    </label>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Embedded inside the browse filter <form>. On mount, finds the
 * enclosing form via DOM, listens for input changes, and fires a
 * debounced fetch to /api/listings/count?<current form state> so
 * the user sees "X listings match" update live as they tick chips
 * — without round-tripping the whole browse page on each change.
 */
export function LiveFilterCount({ initial }: { initial?: number }) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [count, setCount] = useState<number | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const form = wrap.closest("form");
    if (!form) return;

    function buildQuery(): string {
      const fd = new FormData(form as HTMLFormElement);
      const sp = new URLSearchParams();
      for (const [k, v] of fd.entries()) {
        if (typeof v !== "string") continue;
        if (v.length === 0) continue;
        sp.append(k, v);
      }
      return sp.toString();
    }

    function schedule() {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(refresh, 250);
    }

    async function refresh() {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/listings/count?${buildQuery()}`,
          { signal: ctl.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { count: number };
        setCount(data.count);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setCount(null);
      } finally {
        if (abortRef.current === ctl) setLoading(false);
      }
    }

    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    // First request when the panel mounts so the count reflects any
    // filters already in the URL.
    refresh();

    return () => {
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
      abortRef.current?.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const display =
    count === null
      ? null
      : count.toLocaleString("en-AU");
  const noun = count === 1 ? "listing" : "listings";

  return (
    <span
      ref={wrapRef}
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 999,
        background:
          count === 0
            ? "#fee2e2"
            : "linear-gradient(135deg, #ecfccb 0%, #d9f99d 100%)",
        border: `1px solid ${count === 0 ? "#fca5a5" : "#bef264"}`,
        opacity: loading ? 0.7 : 1,
        transition: "opacity 120ms ease",
      }}
    >
      {display === null ? (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--ink-3)",
          }}
        >
          Counting…
        </span>
      ) : (
        <>
          <span
            style={{
              fontFamily: "var(--font-display, var(--font-sans))",
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: count === 0 ? "#991b1b" : "#365314",
            }}
          >
            {display}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: count === 0 ? "#991b1b" : "#3f6212",
            }}
          >
            {noun} match
          </span>
        </>
      )}
    </span>
  );
}

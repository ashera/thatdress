"use client";

import { useEffect, useRef, useState } from "react";

type LookupState =
  | { status: "idle" }
  | { status: "loading"; code: string }
  | { status: "found"; code: string; placeName: string | null }
  | { status: "not-found"; code: string }
  | { status: "error" };

/**
 * Postcode input with live suburb lookup. Restricts typing to AU's
 * 4-digit postcode shape, debounces a fetch to /api/postcodes/[code]
 * 300ms after typing stops, and shows the suburb name (or a soft
 * 'not on file' note) underneath the input. Server still validates
 * the format on publish — this is UX, not security.
 */
export function PostcodeInput({
  defaultValue,
  required = true,
}: {
  defaultValue?: string;
  required?: boolean;
}) {
  const initial = (defaultValue ?? "").replace(/\D/g, "").slice(0, 4);
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<LookupState>({ status: "idle" });

  // Latest-fetch token so a slow earlier request can't overwrite a
  // newer one (common when the user types fast).
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (value.length !== 4) {
      setState({ status: "idle" });
      return;
    }
    const reqId = ++reqIdRef.current;
    setState({ status: "loading", code: value });
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/postcodes/${encodeURIComponent(value)}`,
          { cache: "default" },
        );
        if (reqId !== reqIdRef.current) return;
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const data = (await res.json()) as
          | { found: false }
          | { found: true; place_name: string | null };
        if (reqId !== reqIdRef.current) return;
        if (data.found) {
          setState({
            status: "found",
            code: value,
            placeName: data.place_name,
          });
        } else {
          setState({ status: "not-found", code: value });
        }
      } catch {
        if (reqId !== reqIdRef.current) return;
        setState({ status: "error" });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [value]);

  // Only digits, max 4 chars. Strips anything else on input so a
  // paste of '2000 Sydney' becomes '2000'.
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, "").slice(0, 4);
    setValue(next);
  }

  return (
    <>
      <input
        id="location_postal"
        name="location_postal"
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        pattern="^\d{4}$"
        required={required}
        maxLength={4}
        className="input"
        value={value}
        onChange={onChange}
        aria-describedby="location_postal_hint"
      />
      <div
        id="location_postal_hint"
        style={{
          marginTop: 4,
          minHeight: 18,
          fontSize: 12,
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.04em",
        }}
        aria-live="polite"
      >
        {renderHint(state, value)}
      </div>
    </>
  );
}

function renderHint(state: LookupState, value: string): React.ReactNode {
  if (value.length === 0) return "4-digit AU postcode";
  if (value.length < 4) {
    return (
      <span style={{ color: "var(--ink-4)" }}>
        {value.length}/4 digits…
      </span>
    );
  }
  if (state.status === "loading") {
    return <span style={{ color: "var(--ink-4)" }}>Looking up…</span>;
  }
  if (state.status === "found") {
    if (state.placeName) {
      return (
        <span style={{ color: "#166534" }}>
          ✓ {state.placeName}
        </span>
      );
    }
    return (
      <span style={{ color: "#166534" }}>
        ✓ Postcode on file
      </span>
    );
  }
  if (state.status === "not-found") {
    return (
      <span style={{ color: "#92400e" }}>
        Postcode not in our table yet — listing will still publish.
      </span>
    );
  }
  if (state.status === "error") {
    return (
      <span style={{ color: "var(--ink-4)" }}>
        Couldn&rsquo;t check right now.
      </span>
    );
  }
  return null;
}

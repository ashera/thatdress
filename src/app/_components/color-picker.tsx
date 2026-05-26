"use client";

import { useEffect, useRef, useState } from "react";
import type { ColorOption } from "@/lib/ref-data";

/**
 * Native <select> can't render arbitrary content per option (no
 * swatches across browsers). This is a tiny custom dropdown that
 * mimics a Select: hidden input syncs to the form, button opens a
 * panel of swatch + label rows, click selects.
 *
 * Free-text legacy values that aren't in the curated list still
 * appear as the current selection (labelled "(legacy)") so opening
 * an old listing doesn't silently wipe its colour.
 */
export function ColorPicker({
  name,
  id,
  options,
  defaultValue,
}: {
  name: string;
  id?: string;
  options: ColorOption[];
  defaultValue?: string | null;
}) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inList = options.find((o) => o.label === value) ?? null;
  const isLegacy = !!value && !inList;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        className="input"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "left",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <Swatch hex={inList?.swatch ?? null} />
        <span style={{ flex: 1, color: value ? "inherit" : "var(--ink-4)" }}>
          {value
            ? isLegacy
              ? `${value} (legacy)`
              : value
            : "—"}
        </span>
        <span aria-hidden style={{ color: "var(--ink-4)", fontSize: 12 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 30,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            boxShadow:
              "0 12px 24px -8px rgba(0,0,0,0.12), 0 4px 6px -2px rgba(0,0,0,0.05)",
            padding: 4,
          }}
        >
          <Row
            label="—"
            selected={value === ""}
            onClick={() => {
              setValue("");
              setOpen(false);
            }}
          />
          {options.map((o) => (
            <Row
              key={o.id}
              label={o.label}
              swatch={o.swatch}
              selected={value === o.label}
              onClick={() => {
                setValue(o.label);
                setOpen(false);
              }}
            />
          ))}
          {isLegacy && (
            <Row
              label={`${value} (legacy)`}
              selected
              onClick={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  swatch,
  selected,
  onClick,
}: {
  label: string;
  swatch?: string | null;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected ? "true" : "false"}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        background: selected ? "var(--surface-sunken)" : "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 14,
        color: "var(--ink-1)",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "var(--surface-sunken)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <Swatch hex={swatch ?? null} />
      <span style={{ flex: 1 }}>{label}</span>
      {selected && (
        <span aria-hidden style={{ color: "var(--ink-3)", fontSize: 12 }}>
          ✓
        </span>
      )}
    </button>
  );
}

function Swatch({ hex }: { hex: string | null }) {
  // Null hex = pattern / metallic / "no value" — render a conic
  // gradient so the user can tell it's not a real colour.
  const background =
    hex ??
    "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)";
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        flex: "0 0 16px",
        borderRadius: 999,
        background,
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    />
  );
}

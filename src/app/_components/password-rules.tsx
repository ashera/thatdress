"use client";

import { useEffect, useState } from "react";
import {
  checkPasswordRules,
  PASSWORD_RULES_COPY,
} from "@/lib/password-rules";

/**
 * Live password-rule indicator. Listens to a target `<input>` by id
 * (so it works with plain form fields — no need to lift state into a
 * client form) and shows a tick / open circle next to each rule as
 * it's met.
 */
export function PasswordRules({ inputId }: { inputId: string }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return;
    const handler = () => setValue(el.value);
    el.addEventListener("input", handler);
    setValue(el.value);
    return () => el.removeEventListener("input", handler);
  }, [inputId]);

  const checks = checkPasswordRules(value);
  const rules: Array<{ ok: boolean; label: string }> = [
    { ok: checks.length, label: PASSWORD_RULES_COPY.length },
    { ok: checks.upper, label: PASSWORD_RULES_COPY.upper },
    { ok: checks.digit, label: PASSWORD_RULES_COPY.digit },
  ];

  return (
    <ul
      aria-label="Password requirements"
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {rules.map((r) => (
        <li
          key={r.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: r.ok ? "#166534" : "var(--ink-3)",
            transition: "color 120ms ease",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              borderRadius: 999,
              border: r.ok
                ? "1.5px solid #166534"
                : "1.5px solid var(--hairline-strong, #d4d4d4)",
              background: r.ok ? "#dcfce7" : "transparent",
              fontSize: 11,
              lineHeight: 1,
              fontWeight: 700,
              color: r.ok ? "#166534" : "transparent",
            }}
          >
            ✓
          </span>
          <span>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

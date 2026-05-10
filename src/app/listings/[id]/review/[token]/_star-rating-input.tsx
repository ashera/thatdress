"use client";

import { useState } from "react";

/**
 * 1-5 star input. Clicked stars stick gold; hovered stars preview
 * gold and revert on mouse-leave. Submits via a hidden field rather
 * than radios so the visual state and the form payload stay in
 * sync without depending on CSS :checked selectors.
 *
 * Required-by-default so the form refuses to submit at zero stars
 * (the original cause of the seller-rating page looking 'broken' —
 * radios were toggling correctly but the visual didn't change).
 */
export function StarRatingInput({
  name = "stars",
  required = true,
}: {
  name?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const display = hover || value;

  return (
    <div onMouseLeave={() => setHover(0)} style={{ display: "flex", gap: 4 }}>
      <input
        type="hidden"
        name={name}
        value={value || ""}
        required={required}
      />
      {[1, 2, 3, 4, 5].map((n) => {
        const active = display >= n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={value === n}
            onClick={() => setValue(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            style={{
              fontSize: 36,
              lineHeight: 1,
              color: active ? "#fcd34d" : "var(--hairline-strong)",
              border: 0,
              background: "transparent",
              padding: "0 2px",
              cursor: "pointer",
              transition: "color 80ms",
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

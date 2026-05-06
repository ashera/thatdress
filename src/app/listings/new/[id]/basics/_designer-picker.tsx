"use client";

import { useRef } from "react";
import { Field, Input } from "../../../../_components/ui";

/**
 * Designer dropdown + free-text fallback. Renders both the curated
 * <select> and the 'designer not in the list' <input> as a single
 * unit so we can wire one to the other: typing in the input
 * auto-flips the select to '+ My designer isn't listed'. Server
 * action saveDraftBasics still resolves it the same way — id from
 * the dropdown when numeric, free text otherwise.
 */
export function DesignerPicker({
  designers,
  defaultDesignerId,
}: {
  designers: { id: string; label: string }[];
  defaultDesignerId: string | null;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);

  return (
    <>
      <Field label="Designer" htmlFor="designer_id">
        <select
          ref={selectRef}
          id="designer_id"
          name="designer_id"
          className="input"
          defaultValue={defaultDesignerId ?? ""}
          required
        >
          <option value="">Select a designer</option>
          {designers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          <option value="new">+ My designer isn&rsquo;t listed</option>
        </select>
      </Field>

      <Field
        label="Designer name (only if not in the list)"
        htmlFor="designer_name_new"
        help="Type the brand here when it isn't in the dropdown. We'll add it to our list automatically."
      >
        <Input
          id="designer_name_new"
          name="designer_name_new"
          maxLength={80}
          placeholder="e.g. Indie Boutique Brand"
          onInput={(e) => {
            // Auto-switch the dropdown to 'My designer isn't listed'
            // as soon as the seller starts typing here, so they don't
            // have to remember to set it manually.
            const hasText = e.currentTarget.value.trim().length > 0;
            const sel = selectRef.current;
            if (!sel) return;
            if (hasText) {
              sel.value = "new";
            } else if (sel.value === "new") {
              // Cleared input + dropdown still on 'new' → reset so the
              // form doesn't post a missing-name error.
              sel.value = "";
            }
          }}
        />
      </Field>
    </>
  );
}

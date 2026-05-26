"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import type { ColorOption, RefOption } from "@/lib/ref-data";
import { Field, Input } from "./ui";
import { LiveFilterCount } from "./live-filter-count";

export type VisibilityFilter = "all" | "published" | "hidden";

export type ActiveFilters = {
  q?: string;
  designer_id?: string[];
  occasion_id?: string[];
  silhouette_id?: string[];
  size_id?: string[];
  condition_id?: string[];
  length_id?: string[];
  /** Colours are stored as label strings on dresses.color, so the
   *  filter passes labels (not ids) and the SQL WHERE clause matches
   *  the column directly. */
  color?: string[];
  min_price?: string;
  max_price?: string;
  visibility?: VisibilityFilter;
  /** When set via ?trust_status= on the URL, only listings with
   *  that trust status surface in browse. Currently driven by the
   *  buyer's-checklist CTA pointing at /listings?trust_status=verified. */
  trustStatus?: "verified" | "authenticated";
};

type Props = {
  active: ActiveFilters;
  options: {
    designers: RefOption[];
    occasions: RefOption[];
    silhouettes: RefOption[];
    sizes: RefOption[];
    conditions: RefOption[];
    lengths: RefOption[];
    colors: ColorOption[];
  };
  isAdmin?: boolean;
};

export function activeFilterCount(f: ActiveFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.designer_id?.length) n++;
  if (f.occasion_id?.length) n++;
  if (f.silhouette_id?.length) n++;
  if (f.size_id?.length) n++;
  if (f.condition_id?.length) n++;
  if (f.length_id?.length) n++;
  if (f.color?.length) n++;
  if (f.min_price) n++;
  if (f.max_price) n++;
  if (f.visibility && f.visibility !== "all") n++;
  return n;
}

function ChipGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: RefOption[];
  selected: string[] | undefined;
}) {
  const sel = new Set(selected ?? []);
  return (
    <div className="chip-group">
      {options.map((o) => (
        <label key={o.id} className="chip-check">
          <input
            type="checkbox"
            name={name}
            value={o.id}
            defaultChecked={sel.has(o.id)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function FilterGroup({
  label,
  activeCount,
  children,
}: {
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  return (
    <details className="filter-group" open={activeCount > 0}>
      <summary className="filter-group-summary">
        <span className="filter-group-label">{label}</span>
        {activeCount > 0 && (
          <span className="filter-group-count">{activeCount}</span>
        )}
        <span aria-hidden className="filter-group-chev">
          ▾
        </span>
      </summary>
      <div className="filter-group-body">{children}</div>
    </details>
  );
}

function ColorChipGroup({
  name,
  options,
  selected,
}: {
  name: string;
  options: ColorOption[];
  selected: string[] | undefined;
}) {
  // Compare on label since dresses.color stores the label string.
  const sel = new Set(selected ?? []);
  return (
    <div className="chip-group">
      {options.map((o) => {
        const swatch =
          o.swatch ??
          "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)";
        return (
          <label key={o.id} className="chip-check">
            <input
              type="checkbox"
              name={name}
              value={o.label}
              defaultChecked={sel.has(o.label)}
            />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: swatch,
                  border: "1px solid rgba(0,0,0,0.18)",
                }}
              />
              {o.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ListingsFilters({ active, options, isAdmin }: Props) {
  const count = activeFilterCount(active);
  const visibility: VisibilityFilter = active.visibility ?? "all";
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();

  function autoApply() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string") continue;
      if (v.length === 0) continue;
      sp.append(k, v);
    }
    const qs = sp.toString();
    const href = qs ? `/listings?${qs}` : "/listings";
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function schedule() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(autoApply, 250);
  }

  return (
    <details className="filters" open={count > 0}>
      <summary className="filters-summary">
        <span>Filters & search</span>
        {count > 0 && <span className="filters-count">{count} active</span>}
        {isPending && (
          <span
            className="filters-count"
            style={{ background: "#fef3c7", color: "#92400e" }}
          >
            Updating…
          </span>
        )}
      </summary>

      <form
        ref={formRef}
        method="get"
        action="/listings"
        className="filters-form"
        onInput={schedule}
        onChange={schedule}
        // Enter in the search box still works without JS — the form
        // submits to /listings naturally. With JS, autoApply has
        // already fired on every keystroke.
      >
        <Field
          label="Search"
          htmlFor="q"
          help="Matches title, model, designer, and description."
        >
          <Input
            id="q"
            name="q"
            type="search"
            placeholder="e.g. Vera Wang, lace, midi…"
            defaultValue={active.q ?? ""}
            maxLength={120}
          />
        </Field>

        <div className="filter-groups">
          <FilterGroup
            label="Designer"
            activeCount={active.designer_id?.length ?? 0}
          >
            <ChipGroup
              name="designer_id"
              options={options.designers}
              selected={active.designer_id}
            />
          </FilterGroup>

          <FilterGroup
            label="Occasion"
            activeCount={active.occasion_id?.length ?? 0}
          >
            <ChipGroup
              name="occasion_id"
              options={options.occasions}
              selected={active.occasion_id}
            />
          </FilterGroup>

          <FilterGroup
            label="Style"
            activeCount={active.silhouette_id?.length ?? 0}
          >
            <ChipGroup
              name="silhouette_id"
              options={options.silhouettes}
              selected={active.silhouette_id}
            />
          </FilterGroup>

          <FilterGroup
            label="Size"
            activeCount={active.size_id?.length ?? 0}
          >
            <ChipGroup
              name="size_id"
              options={options.sizes}
              selected={active.size_id}
            />
          </FilterGroup>

          <FilterGroup
            label="Length"
            activeCount={active.length_id?.length ?? 0}
          >
            <ChipGroup
              name="length_id"
              options={options.lengths}
              selected={active.length_id}
            />
          </FilterGroup>

          <FilterGroup
            label="Colour"
            activeCount={active.color?.length ?? 0}
          >
            <ColorChipGroup
              name="color"
              options={options.colors}
              selected={active.color}
            />
          </FilterGroup>

          <FilterGroup
            label="Condition"
            activeCount={active.condition_id?.length ?? 0}
          >
            <ChipGroup
              name="condition_id"
              options={options.conditions}
              selected={active.condition_id}
            />
          </FilterGroup>

          {isAdmin && (
            <FilterGroup
              label="Visibility (admin)"
              activeCount={
                active.visibility && active.visibility !== "all" ? 1 : 0
              }
            >
              <div className="chip-group">
                {(["all", "published", "hidden"] as const).map((v) => (
                  <label key={v} className="chip-check">
                    <input
                      type="radio"
                      name="visibility"
                      value={v}
                      defaultChecked={visibility === v}
                    />
                    <span>
                      {v === "all"
                        ? "All"
                        : v === "published"
                          ? "Published"
                          : "Hidden"}
                    </span>
                  </label>
                ))}
              </div>
            </FilterGroup>
          )}
        </div>

        <div className="filters-grid">
          <Field label="Min price ($)" htmlFor="min_price">
            <Input
              id="min_price"
              name="min_price"
              type="number"
              min={0}
              defaultValue={active.min_price ?? ""}
              placeholder="0"
            />
          </Field>
          <Field label="Max price ($)" htmlFor="max_price">
            <Input
              id="max_price"
              name="max_price"
              type="number"
              min={0}
              defaultValue={active.max_price ?? ""}
              placeholder="∞"
            />
          </Field>
        </div>

        <div className="filters-actions">
          <LiveFilterCount />
          <div className="filters-actions-right">
            {count > 0 && (
              <Link href="/listings" className="filters-clear">
                Clear all
              </Link>
            )}
          </div>
        </div>
      </form>
    </details>
  );
}

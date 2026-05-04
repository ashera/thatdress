import Link from "next/link";
import type { RefOption } from "@/lib/ref-data";
import { Button, Field, Input } from "./ui";

export type VisibilityFilter = "all" | "published" | "hidden";

export type ActiveFilters = {
  q?: string;
  designer_id?: string[];
  occasion_id?: string[];
  silhouette_id?: string[];
  size_id?: string[];
  condition_id?: string[];
  min_price?: string;
  max_price?: string;
  visibility?: VisibilityFilter;
};

type Props = {
  active: ActiveFilters;
  options: {
    designers: RefOption[];
    occasions: RefOption[];
    silhouettes: RefOption[];
    sizes: RefOption[];
    conditions: RefOption[];
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

export function ListingsFilters({ active, options, isAdmin }: Props) {
  const count = activeFilterCount(active);
  const visibility: VisibilityFilter = active.visibility ?? "all";
  return (
    <details className="filters" open={count > 0}>
      <summary className="filters-summary">
        <span>Filters & search</span>
        {count > 0 && <span className="filters-count">{count} active</span>}
      </summary>

      <form method="get" action="/listings" className="filters-form">
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

        <fieldset className="filter-fieldset">
          <legend>Designer</legend>
          <ChipGroup
            name="designer_id"
            options={options.designers}
            selected={active.designer_id}
          />
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Occasion</legend>
          <ChipGroup
            name="occasion_id"
            options={options.occasions}
            selected={active.occasion_id}
          />
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Silhouette</legend>
          <ChipGroup
            name="silhouette_id"
            options={options.silhouettes}
            selected={active.silhouette_id}
          />
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Size</legend>
          <ChipGroup
            name="size_id"
            options={options.sizes}
            selected={active.size_id}
          />
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Condition</legend>
          <ChipGroup
            name="condition_id"
            options={options.conditions}
            selected={active.condition_id}
          />
        </fieldset>

        {isAdmin && (
          <fieldset className="filter-fieldset">
            <legend>Visibility (admin)</legend>
            <div className="chip-group">
              {(["all", "published", "hidden"] as const).map((v) => (
                <label key={v} className="chip-check">
                  <input
                    type="radio"
                    name="visibility"
                    value={v}
                    defaultChecked={visibility === v}
                  />
                  <span>{v === "all" ? "All" : v === "published" ? "Published" : "Hidden"}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

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
          <Button type="submit" variant="primary" iconRight="arrow">
            Apply
          </Button>
          {count > 0 && (
            <Link href="/listings" className="filters-clear">
              Clear all
            </Link>
          )}
        </div>
      </form>
    </details>
  );
}

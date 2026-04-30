import Link from "next/link";
import type { RefOption } from "@/lib/ref-data";
import { Button, Field, Input } from "./ui";

export type ActiveFilters = {
  make_id?: string;
  bike_class_id?: string;
  bike_category_id?: string;
  condition_id?: string;
  min_price?: string;
  max_price?: string;
  min_year?: string;
  max_year?: string;
};

type Props = {
  active: ActiveFilters;
  options: {
    makes: RefOption[];
    classes: RefOption[];
    categories: RefOption[];
    conditions: RefOption[];
  };
};

function Select({
  name,
  options,
  defaultValue,
  placeholder,
}: {
  name: string;
  options: RefOption[];
  defaultValue?: string;
  placeholder: string;
}) {
  return (
    <select className="input" name={name} defaultValue={defaultValue ?? ""}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function activeFilterCount(f: ActiveFilters): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length;
}

export function ListingsFilters({ active, options }: Props) {
  const count = activeFilterCount(active);
  return (
    <details className="filters" open={count > 0}>
      <summary className="filters-summary">
        <span>Filters</span>
        {count > 0 && <span className="filters-count">{count} active</span>}
      </summary>

      <form
        method="get"
        action="/listings"
        className="filters-form"
      >
        <div className="filters-grid">
          <Field label="Make" htmlFor="make_id">
            <Select
              name="make_id"
              options={options.makes}
              defaultValue={active.make_id}
              placeholder="Any make"
            />
          </Field>
          <Field label="Class" htmlFor="bike_class_id">
            <Select
              name="bike_class_id"
              options={options.classes}
              defaultValue={active.bike_class_id}
              placeholder="Any class"
            />
          </Field>
          <Field label="Category" htmlFor="bike_category_id">
            <Select
              name="bike_category_id"
              options={options.categories}
              defaultValue={active.bike_category_id}
              placeholder="Any category"
            />
          </Field>
          <Field label="Condition" htmlFor="condition_id">
            <Select
              name="condition_id"
              options={options.conditions}
              defaultValue={active.condition_id}
              placeholder="Any condition"
            />
          </Field>

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
          <Field label="Min year" htmlFor="min_year">
            <Input
              id="min_year"
              name="min_year"
              type="number"
              min={1990}
              defaultValue={active.min_year ?? ""}
              placeholder="1990"
            />
          </Field>
          <Field label="Max year" htmlFor="max_year">
            <Input
              id="max_year"
              name="max_year"
              type="number"
              min={1990}
              defaultValue={active.max_year ?? ""}
              placeholder="now"
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

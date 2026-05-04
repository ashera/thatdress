import type { ListingRefOptions, RefOption } from "@/lib/ref-data";
import { Button, Field, Input, Textarea } from "./ui";

export type ListingFormDefaults = {
  description?: string | null;
  price_dollars?: string;
  offers_enabled?: boolean;
  region_id?: string | null;
  designer_id?: string | null;
  model?: string | null;
  year?: number | null;
  condition_id?: string | null;
  occasion_id?: string | null;
  location_postal?: string | null;
  silhouette_id?: string | null;
  fabric_id?: string | null;
  size_id?: string | null;
  neckline_id?: string | null;
  sleeve_style_id?: string | null;
  length_id?: string | null;
  color?: string | null;
  bust_inches?: number | string | null;
  waist_inches?: number | string | null;
  hips_inches?: number | string | null;
  original_retail_dollars?: string;
  alterations_text?: string | null;
  has_original_receipt?: boolean;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  refs: ListingRefOptions;
  defaults?: ListingFormDefaults;
  hiddenFields?: Array<{ name: string; value: string }>;
  submitLabel: string;
  errorMessage?: string | null;
  showPhotos?: boolean;
};

function Select({
  name,
  options,
  defaultValue,
  required,
  placeholder = "—",
}: {
  name: string;
  options: RefOption[];
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      className="input"
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function nullishStr(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

const CURRENT_YEAR = new Date().getUTCFullYear();

export function ListingForm({
  action,
  refs,
  defaults = {},
  hiddenFields = [],
  submitLabel,
  errorMessage,
  showPhotos = false,
}: Props) {
  return (
    <form
      action={action}
      encType="multipart/form-data"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-7)",
      }}
    >
      {hiddenFields.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}

      <section className="form-card">
        <h2 className="card-heading">Basics</h2>
        <p className="card-sub">Required to publish a listing.</p>

        <Field
          label="Region"
          htmlFor="region_id"
          help="Defaults to your current region. Buyers in this region will see the listing."
        >
          <Select
            name="region_id"
            options={refs.regions}
            defaultValue={defaults.region_id}
            required
            placeholder={
              refs.regions.length === 0
                ? "No regions configured"
                : "Select a region"
            }
          />
        </Field>

        <Field label="Designer" htmlFor="designer_id">
          <Select
            name="designer_id"
            options={refs.designers}
            defaultValue={defaults.designer_id}
            required
            placeholder="Select a designer"
          />
        </Field>

        <Field
          label="Style name / model"
          htmlFor="model"
          help='Free text — e.g. "Hayley", "Daphne", or the SKU.'
        >
          <Input
            id="model"
            name="model"
            required
            maxLength={100}
            defaultValue={defaults.model ?? ""}
          />
        </Field>

        <div className="grid-2">
          <Field label="Year (optional)" htmlFor="year">
            <Input
              id="year"
              name="year"
              type="number"
              min={1990}
              max={CURRENT_YEAR + 1}
              defaultValue={nullishStr(defaults.year)}
            />
          </Field>
          <Field label="Condition" htmlFor="condition_id">
            <Select
              name="condition_id"
              options={refs.conditions}
              defaultValue={defaults.condition_id}
              required
            />
          </Field>
        </div>

        <Field label="Occasion" htmlFor="occasion_id">
          <Select
            name="occasion_id"
            options={refs.occasions}
            defaultValue={defaults.occasion_id}
            required
          />
        </Field>

        <p className="card-sub" style={{ marginTop: 0 }}>
          The listing title shows up automatically as &ldquo;Designer Style&rdquo;.
        </p>

        <div className="grid-2">
          <Field label="Price (USD)" htmlFor="price">
            <Input
              id="price"
              type="text"
              inputMode="decimal"
              name="price"
              required
              pattern="^\d+(\.\d{1,2})?$"
              defaultValue={defaults.price_dollars ?? ""}
            />
          </Field>
          <Field label="Postal code / location" htmlFor="location_postal">
            <Input
              id="location_postal"
              name="location_postal"
              required
              maxLength={64}
              defaultValue={defaults.location_postal ?? ""}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            rows={5}
            maxLength={5000}
            defaultValue={defaults.description ?? ""}
          />
        </Field>

        <label className="check-row">
          <input
            type="checkbox"
            name="offers_enabled"
            defaultChecked={!!defaults.offers_enabled}
          />
          <span>
            Open to offers — buyers can propose a different price
          </span>
        </label>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Style</h2>
        <p className="card-sub">All optional — but each one helps buyers filter.</p>

        <div className="grid-2">
          <Field label="Silhouette" htmlFor="silhouette_id">
            <Select
              name="silhouette_id"
              options={refs.silhouettes}
              defaultValue={defaults.silhouette_id}
            />
          </Field>
          <Field label="Length" htmlFor="length_id">
            <Select
              name="length_id"
              options={refs.lengths}
              defaultValue={defaults.length_id}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Fabric" htmlFor="fabric_id">
            <Select
              name="fabric_id"
              options={refs.fabrics}
              defaultValue={defaults.fabric_id}
            />
          </Field>
          <Field label="Color" htmlFor="color">
            <Input
              id="color"
              name="color"
              maxLength={32}
              defaultValue={defaults.color ?? ""}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Neckline" htmlFor="neckline_id">
            <Select
              name="neckline_id"
              options={refs.necklines}
              defaultValue={defaults.neckline_id}
            />
          </Field>
          <Field label="Sleeve" htmlFor="sleeve_style_id">
            <Select
              name="sleeve_style_id"
              options={refs.sleeveStyles}
              defaultValue={defaults.sleeve_style_id}
            />
          </Field>
        </div>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Size &amp; fit</h2>
        <p className="card-sub">
          Labelled size plus measurements — the data buyers want most.
        </p>

        <Field label="Labelled size" htmlFor="size_id">
          <Select
            name="size_id"
            options={refs.sizes}
            defaultValue={defaults.size_id}
          />
        </Field>

        <div className="grid-2">
          <Field label="Bust (inches)" htmlFor="bust_inches">
            <Input
              id="bust_inches"
              name="bust_inches"
              type="number"
              step="0.5"
              min={20}
              max={70}
              defaultValue={nullishStr(defaults.bust_inches)}
            />
          </Field>
          <Field label="Waist (inches)" htmlFor="waist_inches">
            <Input
              id="waist_inches"
              name="waist_inches"
              type="number"
              step="0.5"
              min={18}
              max={70}
              defaultValue={nullishStr(defaults.waist_inches)}
            />
          </Field>
        </div>

        <Field label="Hips (inches)" htmlFor="hips_inches">
          <Input
            id="hips_inches"
            name="hips_inches"
            type="number"
            step="0.5"
            min={24}
            max={80}
            defaultValue={nullishStr(defaults.hips_inches)}
          />
        </Field>
      </section>

      <details className="form-card form-card--collapse">
        <summary className="card-heading">Optional details</summary>
        <p className="card-sub">Provenance and tailoring notes for serious buyers.</p>

        <Field
          label="Original retail price (USD)"
          htmlFor="original_retail"
          help="Helps buyers value the discount."
        >
          <Input
            id="original_retail"
            type="text"
            inputMode="decimal"
            name="original_retail"
            pattern="^\d+(\.\d{1,2})?$"
            defaultValue={defaults.original_retail_dollars ?? ""}
          />
        </Field>

        <Field label="Alterations &amp; tailoring notes" htmlFor="alterations_text">
          <Textarea
            id="alterations_text"
            name="alterations_text"
            rows={3}
            maxLength={2000}
            defaultValue={defaults.alterations_text ?? ""}
          />
        </Field>

        <label className="check-row">
          <input
            type="checkbox"
            name="has_original_receipt"
            defaultChecked={!!defaults.has_original_receipt}
          />
          <span>Has original receipt or proof of purchase</span>
        </label>
      </details>

      {showPhotos && (
        <section className="form-card">
          <h2 className="card-heading">Photos</h2>
          <p className="card-sub">
            Up to 10 · JPEG, PNG, WebP · 5 MB each. The first one becomes the
            default.
          </p>
          <Field label="Add photos" htmlFor="images">
            <input
              id="images"
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="file-input"
            />
          </Field>
        </section>
      )}

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      <div
        style={{
          display: "flex",
          gap: "var(--s-3)",
          justifyContent: "flex-end",
        }}
      >
        <Button type="submit" variant="primary" iconRight="arrow">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

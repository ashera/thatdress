import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftMeasurements } from "@/lib/actions/listing-wizard";
import { Field, Input } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
  type DraftRow,
} from "../_wizard";
import type { RefOption } from "@/lib/ref-data";

export const dynamic = "force-dynamic";

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

function nstr(v: number | string | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

function dollarsFromCents(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "";
  const d = cents / 100;
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}

export default async function WizardMeasurementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? STEP_ERRORS[error] ?? null : null;

  const [{ draft }, refs] = await Promise.all([
    loadDraft(id, "measurements"),
    loadListingRefOptions(),
  ]);

  const d: DraftRow = draft;

  return (
    <WizardShell
      step="measurements"
      draftId={draft.id}
      errorMessage={errorMessage}
    >
      <WizardHero
        icon="bolt"
        headline="The bit that decides whether it fits"
        body="Buyers obsess over fit. Listing the labelled size is the start; bust/waist/hip measurements close the deal — they&rsquo;re the difference between &ldquo;maybe&rdquo; and &ldquo;sold&rdquo;."
      />

      <form
        action={saveDraftMeasurements}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Size</h2>
          <p className="card-sub">Optional, but the first thing buyers filter on.</p>

          <Field label="Labelled size" htmlFor="size_id">
            <Select
              name="size_id"
              options={refs.sizes}
              defaultValue={d.size_id}
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Measurements (inches)</h2>
          <p className="card-sub">All optional, but worth their weight in saved messages.</p>
          <WizardTip>
            Measure flat, lying down, then double. Bust is across the fullest
            point; waist is the narrowest part of the dress; hips are about
            8&Prime; below the waist seam.
          </WizardTip>

          <div className="grid-2">
            <Field label="Bust" htmlFor="bust_inches">
              <Input
                id="bust_inches"
                name="bust_inches"
                type="number"
                step="0.5"
                min={20}
                max={70}
                defaultValue={nstr(d.bust_inches)}
              />
            </Field>
            <Field label="Waist" htmlFor="waist_inches">
              <Input
                id="waist_inches"
                name="waist_inches"
                type="number"
                step="0.5"
                min={18}
                max={70}
                defaultValue={nstr(d.waist_inches)}
              />
            </Field>
          </div>

          <Field label="Hips" htmlFor="hips_inches">
            <Input
              id="hips_inches"
              name="hips_inches"
              type="number"
              step="0.5"
              min={24}
              max={80}
              defaultValue={nstr(d.hips_inches)}
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Original retail</h2>
          <p className="card-sub">
            Optional. Buyers love seeing the original price — it&rsquo;s how
            they value the discount.
          </p>

          <Field label="Original retail price (USD)" htmlFor="original_retail">
            <Input
              id="original_retail"
              type="text"
              inputMode="decimal"
              name="original_retail"
              pattern="^\d+(\.\d{1,2})?$"
              defaultValue={dollarsFromCents(d.original_retail_cents)}
            />
          </Field>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/style`} />
      </form>
    </WizardShell>
  );
}

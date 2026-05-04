import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftStyle } from "@/lib/actions/listing-wizard";
import { Field, Input } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
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

export default async function WizardStylePage({
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
    loadDraft(id, "style"),
    loadListingRefOptions(),
  ]);

  const d: DraftRow = draft;

  return (
    <WizardShell step="style" draftId={draft.id} errorMessage={errorMessage}>
      <WizardHero
        icon="shield"
        headline="The look"
        body="What kind of dress, and what occasion it&rsquo;s built for. Occasion is required so buyers can filter — the rest sharpens your match for the right wearer."
      />

      <form
        action={saveDraftStyle}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Occasion</h2>
          <p className="card-sub">Required to continue.</p>

          <Field label="Occasion" htmlFor="occasion_id">
            <Select
              name="occasion_id"
              options={refs.occasions}
              defaultValue={d.occasion_id}
              required
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Cut &amp; cloth</h2>
          <p className="card-sub">All optional — fill in what you know.</p>

          <div className="grid-2">
            <Field label="Silhouette" htmlFor="silhouette_id">
              <Select
                name="silhouette_id"
                options={refs.silhouettes}
                defaultValue={d.silhouette_id}
              />
            </Field>
            <Field label="Length" htmlFor="length_id">
              <Select
                name="length_id"
                options={refs.lengths}
                defaultValue={d.length_id}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Fabric" htmlFor="fabric_id">
              <Select
                name="fabric_id"
                options={refs.fabrics}
                defaultValue={d.fabric_id}
              />
            </Field>
            <Field label="Color" htmlFor="color">
              <Input
                id="color"
                name="color"
                maxLength={32}
                defaultValue={d.color ?? ""}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Neckline" htmlFor="neckline_id">
              <Select
                name="neckline_id"
                options={refs.necklines}
                defaultValue={d.neckline_id}
              />
            </Field>
            <Field label="Sleeve" htmlFor="sleeve_style_id">
              <Select
                name="sleeve_style_id"
                options={refs.sleeveStyles}
                defaultValue={d.sleeve_style_id}
              />
            </Field>
          </div>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/photos`} />
      </form>
    </WizardShell>
  );
}

import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftPhotos } from "@/lib/actions/listing-wizard";
import { Field, Input } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();

export default async function WizardPhotosPage({
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
    loadDraft(id, "photos"),
    loadListingRefOptions(),
  ]);

  return (
    <WizardShell step="photos" draftId={draft.id} errorMessage={errorMessage}>
      <WizardHero
        icon="camera"
        headline="Lead with a great photo"
        body="Listings with a clean hero shot get roughly twice the inquiries. Shoot the drive side in daylight, against a plain wall — no clutter, no garage door."
      />

      <form
        action={saveDraftPhotos}
        encType="multipart/form-data"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Photos</h2>
          <p className="card-sub">
            Up to 10 · JPEG, PNG, WebP · 5 MB each. The first one becomes
            the default — pick the one you&rsquo;d want a buyer to see first.
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
          <WizardTip>
            Five photos beats ten blurry ones. A drive-side hero, the cockpit,
            the motor, the battery, and any wear is plenty.
          </WizardTip>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Bike basics</h2>
          <p className="card-sub">
            All three are required. Your listing title is built automatically
            from these — e.g. &ldquo;2024 Trek Allant+ 7&rdquo;.
          </p>

          <Field label="Make" htmlFor="make_id">
            <select
              id="make_id"
              name="make_id"
              className="input"
              defaultValue={draft.make_id ?? ""}
              required
            >
              <option value="">Select a make</option>
              {refs.makes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid-2">
            <Field
              label="Model"
              htmlFor="model"
              help="Free text — e.g. Turbo Vado 4.0."
            >
              <Input
                id="model"
                name="model"
                required
                maxLength={100}
                defaultValue={draft.model ?? ""}
              />
            </Field>
            <Field label="Year" htmlFor="year">
              <Input
                id="year"
                name="year"
                type="number"
                required
                min={2000}
                max={CURRENT_YEAR + 1}
                defaultValue={
                  draft.year != null ? String(draft.year) : ""
                }
              />
            </Field>
          </div>
        </section>

        <StepNav />
      </form>
    </WizardShell>
  );
}

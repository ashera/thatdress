import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftBasics } from "@/lib/actions/listing-wizard";
import { Field, Input } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";
import { DesignerPicker } from "./_designer-picker";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();

export default async function WizardBasicsPage({
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
    loadDraft(id, "basics"),
    loadListingRefOptions(),
  ]);

  return (
    <WizardShell step="basics" draft={draft} errorMessage={errorMessage}>
      <WizardHero
        icon="verified"
        headline="Tell us what we're listing"
        body="The designer and style name are how buyers find your dress in search. Your listing title is built automatically from these — e.g. 'Vera Wang Hayley'."
      />

      <form
        action={saveDraftBasics}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Dress basics</h2>
          <p className="card-sub">
            Designer and style name are required. Year is optional but
            helps buyers tell which season&rsquo;s collection you have.
          </p>

          <DesignerPicker
            designers={refs.designers}
            defaultDesignerId={draft.designer_id}
          />

          <div className="grid-2">
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
                defaultValue={draft.model ?? ""}
              />
            </Field>
            <Field
              label="Year (optional)"
              htmlFor="year"
              help="Season or year released, if known."
            >
              <Input
                id="year"
                name="year"
                type="number"
                min={1990}
                max={CURRENT_YEAR + 1}
                defaultValue={draft.year != null ? String(draft.year) : ""}
              />
            </Field>
          </div>

          <WizardTip>
            Can&rsquo;t see your designer? Pick &ldquo;My designer
            isn&rsquo;t listed&rdquo; from the dropdown and type the
            name in the box. It&rsquo;ll be added to our list so other
            sellers (and buyers) can find it too.
          </WizardTip>
        </section>

        <StepNav />
      </form>
    </WizardShell>
  );
}

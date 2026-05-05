import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftCondition } from "@/lib/actions/listing-wizard";
import { Field, Textarea } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";

export const dynamic = "force-dynamic";

export default async function WizardConditionPage({
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
    loadDraft(id, "condition"),
    loadListingRefOptions(),
  ]);

  return (
    <WizardShell
      step="condition"
      draft={draft}
      errorMessage={errorMessage}
    >
      <WizardHero
        icon="shield"
        headline="Honest beats glossy"
        body='&ldquo;Excellent, with a tiny snag near the hem&rdquo; outsells &ldquo;Like new&rdquo; every time. Serious buyers reward candour, and they can usually spot what a listing is hiding within ten seconds.'
      />

      <form
        action={saveDraftCondition}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Condition</h2>
          <p className="card-sub">Required to continue.</p>

          <Field label="Condition grade" htmlFor="condition_id">
            <select
              id="condition_id"
              name="condition_id"
              className="input"
              defaultValue={draft.condition_id ?? ""}
              required
            >
              <option value="">Select a condition</option>
              {refs.conditions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Provenance</h2>
          <p className="card-sub">Optional but reassuring — original receipts massively help with authenticity.</p>

          <label className="check-row">
            <input
              type="checkbox"
              name="has_original_receipt"
              defaultChecked={!!draft.has_original_receipt}
            />
            <span>Has original receipt or proof of purchase</span>
          </label>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Alterations</h2>
          <p className="card-sub">Optional.</p>
          <WizardTip>
            Note any tailoring — hem shortened by 2&Prime;, bust taken in,
            straps added. It&rsquo;s the first question every buyer asks.
          </WizardTip>

          <Field label="Alterations &amp; tailoring notes" htmlFor="alterations_text">
            <Textarea
              id="alterations_text"
              name="alterations_text"
              rows={3}
              maxLength={2000}
              defaultValue={draft.alterations_text ?? ""}
            />
          </Field>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/measurements`} />
      </form>
    </WizardShell>
  );
}

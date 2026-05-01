import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftCondition } from "@/lib/actions/listing-wizard";
import { Field, Input, Textarea } from "../../../../_components/ui";
import { loadDraft, StepNav, STEP_ERRORS, WizardShell } from "../_wizard";

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
      draftId={draft.id}
      errorMessage={errorMessage}
    >
      <p style={{ color: "var(--ink-3)", margin: "calc(-1 * var(--s-5)) 0 var(--s-5)" }}>
        Buyers want an honest read on wear and history. Be candid — it
        builds trust and surfaces serious leads.
      </p>

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
          <p className="card-sub">Optional but reassuring.</p>

          <div className="grid-2">
            <label className="check-row">
              <input
                type="checkbox"
                name="has_warranty"
                defaultChecked={!!draft.has_warranty}
              />
              <span>Has remaining warranty</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="has_original_receipt"
                defaultChecked={!!draft.has_original_receipt}
              />
              <span>Has original receipt</span>
            </label>
          </div>

          <Field label="Warranty notes" htmlFor="warranty_text">
            <Input
              id="warranty_text"
              name="warranty_text"
              maxLength={500}
              defaultValue={draft.warranty_text ?? ""}
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">What&rsquo;s included &amp; what&rsquo;s changed</h2>
          <p className="card-sub">Optional.</p>

          <Field label="Accessories" htmlFor="accessories">
            <Textarea
              id="accessories"
              name="accessories"
              rows={3}
              maxLength={2000}
              defaultValue={draft.accessories ?? ""}
            />
          </Field>

          <Field label="Modifications" htmlFor="modifications">
            <Textarea
              id="modifications"
              name="modifications"
              rows={3}
              maxLength={2000}
              defaultValue={draft.modifications ?? ""}
            />
          </Field>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/build`} />
      </form>
    </WizardShell>
  );
}

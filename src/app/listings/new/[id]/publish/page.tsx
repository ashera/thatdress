import { loadListingRefOptions } from "@/lib/ref-data";
import { publishDraftListing } from "@/lib/actions/listing-wizard";
import { Field, Input, Textarea } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";

export const dynamic = "force-dynamic";

function priceDefault(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export default async function WizardPublishPage({
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
    loadDraft(id, "publish"),
    loadListingRefOptions(),
  ]);

  return (
    <WizardShell
      step="publish"
      draftId={draft.id}
      errorMessage={errorMessage}
    >
      <WizardHero
        icon="send"
        headline="Time to go live"
        body="Set a price that reflects similar bikes you&rsquo;ve seen here, drop a few sentences in the description, and you&rsquo;re live to every buyer in the region."
      />

      <form
        action={publishDraftListing}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Price &amp; location</h2>
          <p className="card-sub">All required.</p>

          <div className="grid-2">
            <Field label="Price (USD)" htmlFor="price">
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                name="price"
                required
                pattern="^\d+(\.\d{1,2})?$"
                defaultValue={priceDefault(draft.price_cents)}
              />
            </Field>
            <Field label="Postal code / location" htmlFor="location_postal">
              <Input
                id="location_postal"
                name="location_postal"
                required
                maxLength={64}
                defaultValue={draft.location_postal ?? ""}
              />
            </Field>
          </div>

          <Field
            label="Region"
            htmlFor="region_id"
            help="Buyers in this region will see the listing."
          >
            <select
              id="region_id"
              name="region_id"
              className="input"
              defaultValue={draft.region_id ?? ""}
              required
            >
              <option value="">
                {refs.regions.length === 0
                  ? "No regions configured"
                  : "Select a region"}
              </option>
              {refs.regions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Description</h2>
          <p className="card-sub">Optional but recommended.</p>
          <WizardTip>
            Two short paragraphs is the sweet spot: why you&rsquo;re selling,
            and how it rides. Skip the spec dump — you already filled that in.
          </WizardTip>

          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={6}
              maxLength={5000}
              defaultValue={draft.description ?? ""}
            />
          </Field>

          <label className="check-row">
            <input
              type="checkbox"
              name="offers_enabled"
              defaultChecked={!!draft.offers_enabled}
            />
            <span>Open to offers — buyers can propose a different price</span>
          </label>
        </section>

        <StepNav
          prevHref={`/listings/new/${draft.id}/condition`}
          submitLabel="Publish listing"
        />
      </form>
    </WizardShell>
  );
}

import { loadListingRefOptions } from "@/lib/ref-data";
import { publishDraftListing } from "@/lib/actions/listing-wizard";
import { query } from "@/lib/db";
import {
  estimateValue,
  isConditionSlug,
  isDesignerTier,
  type ConditionSlug,
  type DesignerTier,
} from "@/lib/value-estimator";
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

const CURRENT_YEAR = new Date().getUTCFullYear();

function fmtAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

type EstimatorInputsRow = {
  tier: string | null;
  condition_slug: string | null;
};

async function buildSuggestion(draft: {
  id: string;
  designer_id: string | null;
  condition_id: string | null;
  year: number | null;
  original_retail_cents: number | null;
  has_original_receipt: boolean | null;
  alterations_text: string | null;
}): Promise<{ low: string; high: string } | null> {
  if (
    !draft.designer_id ||
    !draft.condition_id ||
    !draft.original_retail_cents ||
    draft.original_retail_cents <= 0
  ) {
    return null;
  }
  let row: EstimatorInputsRow | undefined;
  try {
    const r = await query<EstimatorInputsRow>(
      `SELECT d.tier, cg.slug AS condition_slug
         FROM listings l
         LEFT JOIN designers        d  ON d.id  = l.designer_id
         LEFT JOIN condition_grades cg ON cg.id = l.condition_id
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [draft.id],
    );
    row = r.rows[0];
  } catch {
    return null;
  }
  if (!row?.tier || !row?.condition_slug) return null;
  if (!isDesignerTier(row.tier)) return null;
  if (!isConditionSlug(row.condition_slug)) return null;

  const tier: DesignerTier = row.tier;
  const conditionSlug: ConditionSlug = row.condition_slug;
  const ageYears =
    draft.year != null ? Math.max(0, CURRENT_YEAR - draft.year) : null;

  const result = estimateValue({
    retailCents: draft.original_retail_cents,
    tier,
    conditionSlug,
    ageYears,
    hasReceipt: !!draft.has_original_receipt,
    hasAlterations: !!(draft.alterations_text && draft.alterations_text.trim()),
  });

  return {
    low: fmtAud(result.lowCents),
    high: fmtAud(result.highCents),
  };
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

  const suggestion = await buildSuggestion(draft);

  return (
    <WizardShell
      step="publish"
      draftId={draft.id}
      errorMessage={errorMessage}
    >
      <WizardHero
        icon="send"
        headline="Time to go live"
        body="Set a price that reflects similar dresses you&rsquo;ve seen here, drop a few sentences in the description, and you&rsquo;re live to every buyer in the region."
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

          {suggestion && (
            <div
              style={{
                marginBottom: "var(--s-4)",
                padding: "var(--s-4) var(--s-5)",
                background: "var(--volt-50)",
                border: "1px solid var(--volt-100)",
                borderRadius: 12,
                color: "var(--ink-2)",
                fontSize: "var(--t-body-s)",
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--volt-700)",
                  marginBottom: 6,
                }}
              >
                Suggested range
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--ink-1)",
                  letterSpacing: "-0.01em",
                }}
              >
                {suggestion.low} – {suggestion.high}
              </div>
              <div style={{ marginTop: 4 }}>
                Based on the designer, condition, age, and original
                retail price you&rsquo;ve already entered. Listings priced
                inside this range typically sell faster.{" "}
                <a
                  href="/tools/value-estimator"
                  style={{ color: "var(--ink-1)", textDecoration: "underline" }}
                >
                  How this works →
                </a>
              </div>
            </div>
          )}

          <div className="grid-2">
            <Field label="Price (AUD)" htmlFor="price">
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
            and how it wears. Skip the spec dump — you already filled that in.
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

import { loadListingRefOptions } from "@/lib/ref-data";
import { publishDraftListing } from "@/lib/actions/listing-wizard";
import { setListingVisibility } from "@/lib/actions/listings";
import { query } from "@/lib/db";
import {
  estimateValue,
  isConditionSlug,
  isDesignerTier,
  type ConditionSlug,
  type DesignerTier,
} from "@/lib/value-estimator";
import { Button, Field, Input, Textarea } from "../../../../_components/ui";
import { PostcodeInput } from "./_postcode-input";
import {
  isEditMode,
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = new Date().getUTCFullYear();
const PRICE_MAX_DOLLARS = 1_000_000;

function priceDefault(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "";
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

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

type Suggestion = {
  low: string;
  high: string;
  /** Pre-filled estimator URL — opens the tool with the draft's data
   *  and a from=wizard handshake so the tool's CTAs return here. */
  estimatorUrl: string;
};

async function buildSuggestion(draft: {
  id: string;
  designer_id: string | null;
  condition_id: string | null;
  year: number | null;
  original_retail_cents: number | null;
  has_original_receipt: boolean | null;
  alterations_text: string | null;
}): Promise<Suggestion | null> {
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
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers        d  ON d.id  = dr.designer_id
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

  // Compose the deep-link to the estimator with everything pre-filled.
  const params = new URLSearchParams();
  params.set("designer", draft.designer_id);
  params.set("retail", (draft.original_retail_cents / 100).toString());
  params.set("condition", conditionSlug);
  if (draft.year != null) params.set("year", String(draft.year));
  if (draft.has_original_receipt) params.set("receipt", "1");
  if (draft.alterations_text && draft.alterations_text.trim()) {
    params.set("alterations", "1");
  }
  params.set("from", "wizard");
  params.set("listingId", draft.id);

  return {
    low: fmtAud(result.lowCents),
    high: fmtAud(result.highCents),
    estimatorUrl: `/tools/value-estimator?${params.toString()}`,
  };
}

function parsePriceParam(raw: string | string[] | undefined): string | null {
  if (raw === undefined) return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  // Accept a positive number with up to 2 decimal places.
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n) || n <= 0 || n > PRICE_MAX_DOLLARS) return null;
  return v;
}

export default async function WizardPublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; price?: string | string[] }>;
}) {
  const { id } = await params;
  const { error, price } = await searchParams;
  const errorMessage = error ? STEP_ERRORS[error] ?? null : null;

  const [{ draft }, refs] = await Promise.all([
    loadDraft(id, "publish"),
    loadListingRefOptions(),
  ]);

  const suggestion = await buildSuggestion(draft);

  // Price input default: explicit ?price=... wins (came back from the
  // estimator), then the saved draft price, then empty.
  const priceFromUrl = parsePriceParam(price);
  const priceInputDefault = priceFromUrl ?? priceDefault(draft.price_cents);
  const priceCameFromEstimator = priceFromUrl !== null;

  const editMode = isEditMode(draft);

  return (
    <WizardShell
      step="publish"
      draft={draft}
      errorMessage={errorMessage}
    >
      <WizardHero
        icon="send"
        headline={editMode ? "Save your changes" : "Time to go live"}
        body={
          editMode
            ? "Update the price, description, or trust confirmations. Tick both boxes below to keep (or earn) the public Verified badge."
            : "Set a price that reflects similar dresses you've seen here, drop a few sentences in the description, and you're live to every buyer in the region."
        }
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
                Based on the designer, condition, age, and original retail
                price you&rsquo;ve already entered. Listings priced inside
                this range typically sell faster.{" "}
                <a
                  href={suggestion.estimatorUrl}
                  style={{
                    color: "var(--ink-1)",
                    textDecoration: "underline",
                  }}
                >
                  Open the full estimator →
                </a>
              </div>
            </div>
          )}

          {priceCameFromEstimator && (
            <p
              className="form-success"
              style={{
                margin: "0 0 var(--s-4)",
                fontSize: "var(--t-body-s)",
              }}
            >
              Price filled in from the estimator. Edit if you want to.
            </p>
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
                defaultValue={priceInputDefault}
              />
            </Field>
            <Field label="Postcode" htmlFor="location_postal">
              <PostcodeInput defaultValue={draft.location_postal ?? ""} />
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

        <section className="form-card">
          <h2 className="card-heading">Trust &amp; authenticity</h2>
          <p className="card-sub">
            Tick both to qualify for the public Verified badge. Buyers
            see the badge on your listing card and detail page; listings
            with it sell faster.
          </p>

          <label className="check-row" style={{ alignItems: "flex-start" }}>
            <input
              type="checkbox"
              name="is_authentic_declared"
              defaultChecked={!!draft.is_authentic_declared}
              required
              style={{ marginTop: 4 }}
            />
            <span style={{ display: "block" }}>
              <strong style={{ color: "var(--ink-1)" }}>
                I confirm this dress is authentic
              </strong>
              <span
                style={{
                  display: "block",
                  color: "var(--ink-3)",
                  fontSize: "var(--t-body-s)",
                  marginTop: 2,
                }}
              >
                Required to publish. Knowingly listing a counterfeit gets
                the listing removed.
              </span>
            </span>
          </label>
        </section>

        <StepNav
          prevHref={`/listings/new/${draft.id}/condition`}
          submitLabel={editMode ? "Save changes" : "Publish listing"}
        />
      </form>

      {editMode && (
        <section
          className="form-card"
          style={{ marginTop: "var(--s-7)" }}
        >
          <h2 className="card-heading">Visibility</h2>
          <p className="card-sub">
            {draft.is_published
              ? "Visible in browse and discoverable by other users."
              : "Hidden from browse — only you (and admins) can see this listing."}
          </p>
          <form action={setListingVisibility}>
            <input type="hidden" name="listingId" value={draft.id} />
            <label className="visibility-toggle">
              <input
                type="checkbox"
                name="is_published"
                defaultChecked={!!draft.is_published}
              />
              <span className="visibility-track" aria-hidden />
              <span className="visibility-label">
                Show in public browse results
              </span>
            </label>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "var(--s-3)",
              }}
            >
              <Button type="submit" variant="primary" size="sm">
                Update visibility
              </Button>
            </div>
          </form>
        </section>
      )}
    </WizardShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/email";
import { ToolHero } from "../../_components/tool-hero";
import {
  estimateValue,
  isConditionSlug,
  isDesignerTier,
  TIER_LABELS,
  type ConditionSlug,
  type DesignerTier,
  type EstimatorResult,
} from "@/lib/value-estimator";
import {
  Button,
  ButtonLink,
  Field,
  Input,
} from "../../_components/ui";

export const revalidate = 3600; // ref data changes rarely; the result is computed from URL params

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const title =
    "What's my dress worth? Pre-loved formal-dress value estimator";
  const description =
    "Get a guidance range for your designer dress's resale value on the Australian peer-to-peer market — based on the brand, condition, age, and original retail price.";
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/tools/value-estimator` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/tools/value-estimator`,
      title,
      description,
      siteName: "frockd",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

type DesignerRow = { id: string; name: string; tier: DesignerTier };
type ConditionRow = { id: string; slug: ConditionSlug; label: string };

type RawParams = {
  designer?: string | string[];
  retail?: string | string[];
  condition?: string | string[];
  year?: string | string[];
  receipt?: string | string[];
  alterations?: string | string[];
  /** Set to "wizard" when the user came from the listing publish step. */
  from?: string | string[];
  /** Numeric listing id paired with from=wizard. */
  listingId?: string | string[];
};

function scalar(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

const CURRENT_YEAR = new Date().getUTCFullYear();
const RETAIL_MIN_DOLLARS = 50;
const RETAIL_MAX_DOLLARS = 50_000;

type ParsedInputs = {
  designer: DesignerRow;
  retailCents: number;
  condition: ConditionRow;
  ageYears: number | null;
  hasReceipt: boolean;
  hasAlterations: boolean;
};

function parseInputs(
  sp: RawParams,
  designers: DesignerRow[],
  conditions: ConditionRow[],
): ParsedInputs | null {
  const designerId = scalar(sp.designer);
  const retailRaw = scalar(sp.retail);
  const conditionSlug = scalar(sp.condition);
  if (!designerId || !retailRaw || !conditionSlug) return null;

  const designer = designers.find((d) => d.id === designerId);
  if (!designer) return null;

  const retailDollars = Number.parseFloat(retailRaw);
  if (
    !Number.isFinite(retailDollars) ||
    retailDollars < RETAIL_MIN_DOLLARS ||
    retailDollars > RETAIL_MAX_DOLLARS
  ) {
    return null;
  }
  const retailCents = Math.round(retailDollars * 100);

  const condition = conditions.find((c) => c.slug === conditionSlug);
  if (!condition) return null;

  const yearRaw = scalar(sp.year);
  let ageYears: number | null = null;
  if (yearRaw) {
    const y = Number.parseInt(yearRaw, 10);
    if (Number.isFinite(y) && y >= 1990 && y <= CURRENT_YEAR + 1) {
      ageYears = Math.max(0, CURRENT_YEAR - y);
    }
  }

  const hasReceipt = scalar(sp.receipt) === "1";
  const hasAlterations = scalar(sp.alterations) === "1";

  return {
    designer,
    retailCents,
    condition,
    ageYears,
    hasReceipt,
    hasAlterations,
  };
}

function fmtAud(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function priceDollars(cents: number): string {
  // Whole-dollar string suitable for the publish-page ?price= param.
  return Math.round(cents / 100).toString();
}

function ResultCard({
  result,
  designer,
  wizardListingId,
}: {
  result: EstimatorResult;
  designer: DesignerRow;
  /** When set, swap the marketing CTAs for "use this price" return links
   *  back into the listing publish step. */
  wizardListingId?: string;
}) {
  const b = result.breakdown;
  // Mid is the simple arithmetic midpoint, rounded to the same $10 grain
  // estimateValue() uses internally. Gives the user a sensible default
  // between aggressive and ambitious pricing.
  const midCents =
    Math.round((result.lowCents + result.highCents) / 2 / 1000) * 1000;
  return (
    <section
      className="form-card"
      style={{ marginTop: "var(--s-7)", padding: "var(--s-7)" }}
    >
      <p
        className="eyebrow"
        style={{ margin: 0, color: "var(--ink-3)" }}
      >
        Estimated resale value
      </p>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 56,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          margin: "var(--s-3) 0 var(--s-2)",
          color: "var(--ink-1)",
        }}
      >
        {fmtAud(result.lowCents)} – {fmtAud(result.highCents)}
      </h2>
      <p style={{ color: "var(--ink-3)", margin: 0 }}>
        Guidance range for a {b.conditionLabel.toLowerCase()} {designer.name}{" "}
        dress on the Australian peer-to-peer market.
      </p>

      <div
        style={{
          marginTop: "var(--s-6)",
          padding: "var(--s-4) var(--s-5)",
          background: "var(--surface-sunken)",
          borderRadius: 12,
          fontSize: "var(--t-body-s)",
          color: "var(--ink-2)",
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: "var(--ink-1)" }}>How we got there</strong>
        <ul style={{ margin: "var(--s-3) 0 0", paddingLeft: "1.2em" }}>
          <li>
            <strong>{fmtAud(b.retailCents)}</strong> original retail
          </li>
          <li>
            <strong>{TIER_LABELS[b.tier]}</strong> tier retains{" "}
            <strong>
              {fmtPct(b.tierLowPct)}–{fmtPct(b.tierHighPct)}
            </strong>{" "}
            of RRP at like-new + recent
          </li>
          <li>
            Condition <strong>{b.conditionLabel}</strong> ×{" "}
            <strong>{b.conditionFactor.toFixed(2)}</strong>
          </li>
          <li>
            <strong>{b.ageLabel}</strong> ×{" "}
            <strong>{b.ageFactor.toFixed(2)}</strong>
          </li>
          {b.receiptFactor !== 1 && (
            <li>
              Original receipt available × <strong>{b.receiptFactor.toFixed(2)}</strong>
            </li>
          )}
          {b.alterationsFactor !== 1 && (
            <li>
              Alterations made × <strong>{b.alterationsFactor.toFixed(2)}</strong>
            </li>
          )}
        </ul>
      </div>

      <p
        style={{
          marginTop: "var(--s-5)",
          fontSize: "var(--t-body-s)",
          color: "var(--ink-3)",
          fontStyle: "italic",
        }}
      >
        This is a guidance range based on resale-market patterns, not a
        guaranteed sale price. Listings with great photos and honest
        condition notes typically land in the upper half of the range.
      </p>

      {wizardListingId ? (
        <div style={{ marginTop: "var(--s-6)" }}>
          <p
            style={{
              margin: "0 0 var(--s-3)",
              color: "var(--ink-2)",
              fontSize: "var(--t-body-s)",
              fontWeight: 600,
            }}
          >
            Pick a price to use back in your listing:
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
              flexWrap: "wrap",
            }}
          >
            <ButtonLink
              href={`/listings/new/${wizardListingId}/publish?price=${priceDollars(result.lowCents)}`}
              variant="ghost"
            >
              Use {fmtAud(result.lowCents)} (low)
            </ButtonLink>
            <ButtonLink
              href={`/listings/new/${wizardListingId}/publish?price=${priceDollars(midCents)}`}
              variant="primary"
              iconRight="arrow"
            >
              Use {fmtAud(midCents)} (mid)
            </ButtonLink>
            <ButtonLink
              href={`/listings/new/${wizardListingId}/publish?price=${priceDollars(result.highCents)}`}
              variant="ghost"
            >
              Use {fmtAud(result.highCents)} (high)
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            marginTop: "var(--s-6)",
            flexWrap: "wrap",
          }}
        >
          <ButtonLink href="/listings/mine" variant="primary" iconRight="arrow">
            List your dress on frockd
          </ButtonLink>
          <ButtonLink
            href={`/listings?designer_id=${designer.id}&min_price=${Math.floor(result.lowCents / 100)}&max_price=${Math.ceil(result.highCents / 100)}`}
            variant="ghost"
          >
            See dresses {fmtAud(result.lowCents)} – {fmtAud(result.highCents)}
          </ButtonLink>
        </div>
      )}
    </section>
  );
}

export default async function ValueEstimatorPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;

  const [designersRes, conditionsRes] = await Promise.all([
    query<DesignerRow>(
      `SELECT id::text, name, tier
         FROM designers
        WHERE is_active = TRUE
        ORDER BY sort_order, id`,
    ),
    query<ConditionRow>(
      `SELECT id::text, slug, label
         FROM condition_grades
        WHERE is_active = TRUE
        ORDER BY sort_order, id`,
    ),
  ]);

  // Defensive narrowing: the DB column is unconstrained TEXT (with a
  // CHECK), so handle any future drift gracefully.
  const designers = designersRes.rows.filter((d) => isDesignerTier(d.tier));
  const conditions = conditionsRes.rows.filter((c) => isConditionSlug(c.slug));

  const parsed = parseInputs(sp, designers, conditions);
  const result = parsed
    ? estimateValue({
        retailCents: parsed.retailCents,
        tier: parsed.designer.tier,
        conditionSlug: parsed.condition.slug,
        ageYears: parsed.ageYears,
        hasReceipt: parsed.hasReceipt,
        hasAlterations: parsed.hasAlterations,
      })
    : null;

  // Wizard handoff: came from /listings/new/{id}/publish, so the result
  // panel offers "use this price" return links instead of marketing CTAs.
  const fromWizard = scalar(sp.from) === "wizard";
  const listingIdRaw = scalar(sp.listingId);
  const wizardListingId =
    fromWizard && listingIdRaw && /^\d+$/.test(listingIdRaw)
      ? listingIdRaw
      : null;

  const formDefaults = {
    designer: scalar(sp.designer) ?? "",
    retail: scalar(sp.retail) ?? "",
    condition: scalar(sp.condition) ?? "",
    year: scalar(sp.year) ?? "",
    receipt: scalar(sp.receipt) === "1",
    alterations: scalar(sp.alterations) === "1",
  };

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        {wizardListingId ? (
          <Link
            href={`/listings/new/${wizardListingId}/publish`}
            style={{
              color: "var(--ink-3)",
              fontSize: "var(--t-body-s)",
              textDecoration: "none",
            }}
          >
            ← Back to your listing
          </Link>
        ) : (
          <Link
            href="/tools"
            style={{
              color: "var(--ink-3)",
              fontSize: "var(--t-body-s)",
              textDecoration: "none",
            }}
          >
            ← All tools
          </Link>
        )}

        <ToolHero
          eyebrow="frockd · tools"
          title="What's my dress worth?"
          subtitle={
            <>
              A guidance range for your designer dress on the Australian
              peer-to-peer resale market. Based on the brand, condition,
              age, and original retail price — no email required.
            </>
          }
          /* (4,0) standing by the mannequin — presenting / appraising. */
          spriteX="100%"
          spriteY="0%"
          speech="Let me appraise this for you."
          accent={{
            from: "#ecfdf5",
            to: "#d1fae5",
            border: "#a7f3d0",
            ink: "#065f46",
          }}
        />

        <form
          method="get"
          action="/tools/value-estimator"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-5)",
            marginBottom: "var(--s-5)",
          }}
        >
          {wizardListingId && (
            <>
              <input type="hidden" name="from" value="wizard" />
              <input
                type="hidden"
                name="listingId"
                value={wizardListingId}
              />
            </>
          )}
          <section className="form-card">
            <h2 className="card-heading">Tell us about the dress</h2>
            <p className="card-sub">All required.</p>

            <Field label="Designer" htmlFor="designer">
              <select
                id="designer"
                name="designer"
                className="input"
                defaultValue={formDefaults.designer}
                required
              >
                <option value="">Select a designer</option>
                {designers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Original retail price (AUD)"
              htmlFor="retail"
              help="What it cost the original buyer, new."
            >
              <Input
                id="retail"
                name="retail"
                type="number"
                inputMode="decimal"
                min={RETAIL_MIN_DOLLARS}
                max={RETAIL_MAX_DOLLARS}
                step="any"
                required
                defaultValue={formDefaults.retail}
              />
            </Field>

            <Field label="Condition" htmlFor="condition">
              <select
                id="condition"
                name="condition"
                className="input"
                defaultValue={formDefaults.condition}
                required
              >
                <option value="">Select a condition</option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <details className="form-card form-card--collapse">
            <summary className="card-heading">Optional details</summary>
            <p className="card-sub">
              These sharpen the estimate but aren&rsquo;t required.
            </p>

            <Field
              label="Year purchased"
              htmlFor="year"
              help="The age of the dress affects how much it depreciates."
            >
              <Input
                id="year"
                name="year"
                type="number"
                min={1990}
                max={CURRENT_YEAR + 1}
                defaultValue={formDefaults.year}
              />
            </Field>

            <label className="check-row">
              <input
                type="checkbox"
                name="receipt"
                value="1"
                defaultChecked={formDefaults.receipt}
              />
              <span>Original receipt or proof of purchase available</span>
            </label>

            <label className="check-row">
              <input
                type="checkbox"
                name="alterations"
                value="1"
                defaultChecked={formDefaults.alterations}
              />
              <span>Has alterations</span>
            </label>
          </details>

          <div
            style={{
              display: "flex",
              gap: "var(--s-3)",
              justifyContent: "flex-end",
            }}
          >
            <Button type="submit" variant="primary" iconRight="arrow">
              Estimate value
            </Button>
          </div>
        </form>

        {result && parsed && (
          <ResultCard
            result={result}
            designer={parsed.designer}
            wizardListingId={wizardListingId ?? undefined}
          />
        )}
      </main>
    </div>
  );
}

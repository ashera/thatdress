/**
 * Pure value-estimator math. No imports from db / next / fs — safe to use
 * from server components, server actions, and (if ever needed) client
 * components. The numbers come from references/stats.md depreciation
 * patterns; tweak there first, then in code.
 */

export type DesignerTier = "premium" | "mid" | "fast-fashion";

export type ConditionSlug =
  | "new-with-tags"
  | "like-new"
  | "excellent"
  | "good"
  | "fair";

export type EstimatorInput = {
  /** Original retail price the seller paid, in cents. */
  retailCents: number;
  /** Designer tier — drives the dominant range. */
  tier: DesignerTier;
  /** Listed condition — drives the largest single multiplier. */
  conditionSlug: ConditionSlug;
  /** Years since the dress was bought. Null = unknown, treated as 2 yr. */
  ageYears: number | null;
  /** Has the seller kept the original receipt / proof of purchase? */
  hasReceipt: boolean;
  /** Has the dress been altered? Alterations narrow the buyer pool. */
  hasAlterations: boolean;
};

export type EstimatorBreakdown = {
  retailCents: number;
  tier: DesignerTier;
  tierLowPct: number;
  tierHighPct: number;
  conditionSlug: ConditionSlug;
  conditionLabel: string;
  conditionFactor: number;
  ageYears: number | null;
  ageLabel: string;
  ageFactor: number;
  receiptFactor: number;
  alterationsFactor: number;
};

export type EstimatorResult = {
  lowCents: number;
  highCents: number;
  breakdown: EstimatorBreakdown;
};

const TIER_RANGES: Record<DesignerTier, { min: number; max: number }> = {
  premium: { min: 0.35, max: 0.55 },
  mid: { min: 0.4, max: 0.6 },
  "fast-fashion": { min: 0.15, max: 0.3 },
};

const CONDITION_FACTORS: Record<
  ConditionSlug,
  { factor: number; label: string }
> = {
  "new-with-tags": { factor: 1.0, label: "New with tags" },
  "like-new": { factor: 0.95, label: "Like new" },
  excellent: { factor: 0.85, label: "Excellent" },
  good: { factor: 0.7, label: "Good" },
  fair: { factor: 0.5, label: "Fair" },
};

export const RECEIPT_FACTOR = 1.05;
export const ALTERATIONS_FACTOR = 0.9;

export const TIER_LABELS: Record<DesignerTier, string> = {
  premium: "Premium designer",
  mid: "Contemporary",
  "fast-fashion": "Fast-fashion / DTC",
};

function ageBucket(years: number | null): { factor: number; label: string } {
  // Unknown age is treated as 2 yr — the realistic average for a dress
  // hitting the resale market a year or two after a single wear.
  const y = years ?? 2;
  if (y <= 1) return { factor: 1.0, label: "0–1 years old" };
  if (y <= 3) return { factor: 0.92, label: "2–3 years old" };
  if (y <= 5) return { factor: 0.85, label: "4–5 years old" };
  return { factor: 0.75, label: "6+ years old" };
}

function roundTo10(cents: number): number {
  return Math.max(0, Math.round(cents / 1000) * 1000);
}

export function estimateValue(input: EstimatorInput): EstimatorResult {
  const tierRange = TIER_RANGES[input.tier];
  const conditionEntry = CONDITION_FACTORS[input.conditionSlug];
  const age = ageBucket(input.ageYears);
  const receiptFactor = input.hasReceipt ? RECEIPT_FACTOR : 1.0;
  const alterationsFactor = input.hasAlterations ? ALTERATIONS_FACTOR : 1.0;

  const sharedMultiplier =
    conditionEntry.factor * age.factor * receiptFactor * alterationsFactor;

  const low = input.retailCents * tierRange.min * sharedMultiplier;
  const high = input.retailCents * tierRange.max * sharedMultiplier;

  return {
    lowCents: roundTo10(low),
    highCents: roundTo10(high),
    breakdown: {
      retailCents: input.retailCents,
      tier: input.tier,
      tierLowPct: tierRange.min,
      tierHighPct: tierRange.max,
      conditionSlug: input.conditionSlug,
      conditionLabel: conditionEntry.label,
      conditionFactor: conditionEntry.factor,
      ageYears: input.ageYears,
      ageLabel: age.label,
      ageFactor: age.factor,
      receiptFactor,
      alterationsFactor,
    },
  };
}

export function isConditionSlug(value: string): value is ConditionSlug {
  return value in CONDITION_FACTORS;
}

export function isDesignerTier(value: string): value is DesignerTier {
  return value === "premium" || value === "mid" || value === "fast-fashion";
}

/**
 * Pure listing-health calculator. No imports from db/next/fs — safe to
 * use anywhere. Drives the seller-only completeness indicator in the
 * wizard and the trust-status auto-elevation logic.
 *
 * Score is 0–100 across six categories:
 *   25 — required basics (designer, model, year, occasion, condition, size)
 *   12 — style details (silhouette, fabric, neckline, sleeve, length, color)
 *   12 — measurements (bust, waist, hips)
 *   15 — provenance (retail price, receipt, authenticity declaration)
 *   20 — photos (count tiers — ≥1 / ≥3 / ≥5)
 *    6 — label/lining photos declaration
 *   10 — description (length tiers — ≥50 chars / ≥150 chars)
 *
 * Suggestions are returned sorted by points so callers can show the
 * top N highest-impact missing items without sorting themselves.
 */

export type HealthInput = {
  designerId: string | null;
  model: string | null;
  year: number | null;
  occasionId: string | null;
  conditionId: string | null;
  sizeId: string | null;
  silhouetteId: string | null;
  fabricId: string | null;
  necklineId: string | null;
  sleeveStyleId: string | null;
  lengthId: string | null;
  color: string | null;
  bustInches: number | null;
  waistInches: number | null;
  hipsInches: number | null;
  originalRetailCents: number | null;
  hasOriginalReceipt: boolean;
  isAuthenticDeclared: boolean;
  includesLabelLiningPhotos: boolean;
  description: string | null;
  imageCount: number;
};

export type HealthSuggestion = {
  /** Points the seller would gain by addressing this item. */
  points: number;
  /** One-line copy shown in the seller-only suggestion list. */
  text: string;
  /** Wizard step the user should jump to in order to fix this. */
  step: "photos" | "style" | "measurements" | "condition" | "publish";
};

export type HealthResult = {
  /** 0-100 integer. */
  score: number;
  /** Sorted by points descending. Empty when score = 100. */
  suggestions: HealthSuggestion[];
};

const HEALTH_THRESHOLD_VERIFIED = 75;
export { HEALTH_THRESHOLD_VERIFIED };

type CheckResult = {
  earned: number;
  suggestion?: HealthSuggestion;
};

function bool(present: boolean): 0 | 1 {
  return present ? 1 : 0;
}

export function computeHealth(input: HealthInput): HealthResult {
  let score = 0;
  const suggestions: HealthSuggestion[] = [];

  function award(check: CheckResult) {
    score += check.earned;
    if (check.earned === 0 && check.suggestion) {
      suggestions.push(check.suggestion);
    }
  }

  // --- Required basics: 25 ---
  award({
    earned: input.designerId ? 4 : 0,
    suggestion: { points: 4, text: "Pick a designer", step: "photos" },
  });
  award({
    earned: input.model ? 4 : 0,
    suggestion: { points: 4, text: "Add the style or model name", step: "photos" },
  });
  award({
    earned: input.year ? 3 : 0,
    suggestion: { points: 3, text: "Add the year you bought it", step: "photos" },
  });
  award({
    earned: input.occasionId ? 4 : 0,
    suggestion: { points: 4, text: "Pick an occasion", step: "style" },
  });
  award({
    earned: input.conditionId ? 4 : 0,
    suggestion: { points: 4, text: "Pick a condition grade", step: "condition" },
  });
  award({
    earned: input.sizeId ? 6 : 0,
    suggestion: { points: 6, text: "Add the labelled size", step: "measurements" },
  });

  // --- Style details: 12 (2 each) ---
  award({
    earned: input.silhouetteId ? 2 : 0,
    suggestion: { points: 2, text: "Pick a silhouette", step: "style" },
  });
  award({
    earned: input.fabricId ? 2 : 0,
    suggestion: { points: 2, text: "Pick a fabric", step: "style" },
  });
  award({
    earned: input.necklineId ? 2 : 0,
    suggestion: { points: 2, text: "Pick a neckline", step: "style" },
  });
  award({
    earned: input.sleeveStyleId ? 2 : 0,
    suggestion: { points: 2, text: "Pick a sleeve style", step: "style" },
  });
  award({
    earned: input.lengthId ? 2 : 0,
    suggestion: { points: 2, text: "Pick a length", step: "style" },
  });
  award({
    earned: input.color ? 2 : 0,
    suggestion: { points: 2, text: "Add a colour", step: "style" },
  });

  // --- Measurements: 12 (4 each) ---
  award({
    earned: input.bustInches ? 4 : 0,
    suggestion: { points: 4, text: "Add bust measurement", step: "measurements" },
  });
  award({
    earned: input.waistInches ? 4 : 0,
    suggestion: { points: 4, text: "Add waist measurement", step: "measurements" },
  });
  award({
    earned: input.hipsInches ? 4 : 0,
    suggestion: { points: 4, text: "Add hips measurement", step: "measurements" },
  });

  // --- Provenance: 15 ---
  award({
    earned: input.originalRetailCents ? 6 : 0,
    suggestion: { points: 6, text: "Add the original retail price", step: "measurements" },
  });
  award({
    earned: input.hasOriginalReceipt ? 4 : 0,
    suggestion: { points: 4, text: "Tick the original-receipt box (if you have it)", step: "condition" },
  });
  award({
    earned: input.isAuthenticDeclared ? 5 : 0,
    suggestion: { points: 5, text: "Confirm authenticity at publish", step: "publish" },
  });

  // --- Photos: 20 (5 / 5 / 10 tiers) ---
  const photoPts =
    bool(input.imageCount >= 1) * 5 +
    bool(input.imageCount >= 3) * 5 +
    bool(input.imageCount >= 5) * 10;
  score += photoPts;
  if (input.imageCount === 0) {
    suggestions.push({ points: 5, text: "Upload at least one photo", step: "photos" });
  } else if (input.imageCount < 3) {
    suggestions.push({ points: 5, text: "Upload at least 3 photos", step: "photos" });
  } else if (input.imageCount < 5) {
    suggestions.push({ points: 10, text: "Upload 5+ photos to maximise interest", step: "photos" });
  }

  // --- Label/lining photos declaration: 6 ---
  award({
    earned: input.includesLabelLiningPhotos ? 6 : 0,
    suggestion: { points: 6, text: "Confirm label + lining photos are included", step: "publish" },
  });

  // --- Description: 10 (7 + 3 bonus tiers) ---
  const descLen = input.description?.trim().length ?? 0;
  let descPts = 0;
  if (descLen >= 50) descPts += 7;
  if (descLen >= 150) descPts += 3;
  score += descPts;
  if (descLen < 50) {
    suggestions.push({ points: 7, text: "Write a 50+ character description", step: "publish" });
  } else if (descLen < 150) {
    suggestions.push({ points: 3, text: "Extend the description past 150 characters", step: "publish" });
  }

  // Cap at 100 (paranoia — totals should already sum to 100 max).
  score = Math.min(100, Math.max(0, score));
  suggestions.sort((a, b) => b.points - a.points);

  return { score, suggestions };
}

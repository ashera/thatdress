/**
 * Pure fit-comparison logic. No DB, no React, no server-only —
 * usable from any context.
 *
 * Convention: callers pass body measurements in inches. Dress
 * measurements come from `dresses.*_inches` columns (the
 * GARMENT measurement, not the model size). We compare each
 * axis independently and roll up to an overall summary.
 *
 * The thresholds assume the dress's measurement already
 * includes whatever ease the cut needs (a 36" body fits a
 * fitted dress with a 36" bust because the ease is baked into
 * the pattern). 'Loose' starts where the gap is bigger than a
 * fitted dress would typically allow.
 */

export type FitStatus =
  | "perfect"
  | "comfortable"
  | "snug"
  | "tight"
  | "loose"
  | "very-loose";

export type FitAxis = "bust" | "waist" | "hips";

export type AxisFit = {
  axis: FitAxis;
  status: FitStatus;
  label: string;
  /** Dress measurement minus body measurement, in inches.
   *  Positive = dress is larger than the body, negative = tighter. */
  diff: number;
};

export type FitSummary = {
  axes: AxisFit[];
  /** Highest-level summary the UI can show as a single chip.
   *  Picks the worst axis (tightest first, then loosest). */
  overall: FitStatus | "unknown";
  overallLabel: string;
};

const STATUS_LABELS: Record<FitStatus, string> = {
  perfect: "Fits like it was cut for you",
  comfortable: "Comfortable fit",
  snug: "A little snug",
  tight: "Likely too tight",
  loose: "Roomy",
  "very-loose": "Significantly loose",
};

const AXIS_LABEL: Record<FitAxis, string> = {
  bust: "Bust",
  waist: "Waist",
  hips: "Hips",
};

function classify(diff: number): FitStatus {
  // diff = dress - body, in inches.
  if (diff < -2) return "tight";
  if (diff < -0.5) return "snug";
  if (diff <= 1) return "perfect";
  if (diff <= 2.5) return "comfortable";
  if (diff <= 4.5) return "loose";
  return "very-loose";
}

function parseInches(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 10 || n > 80) return null;
  return n;
}

/** Build an axis fit assessment when both sides are present. */
function compareAxis(
  axis: FitAxis,
  body: number | null,
  dress: number | null,
): AxisFit | null {
  if (body == null || dress == null) return null;
  const diff = Math.round((dress - body) * 10) / 10;
  const status = classify(diff);
  return {
    axis,
    status,
    label: `${AXIS_LABEL[axis]} · ${STATUS_LABELS[status]}`,
    diff,
  };
}

const STATUS_PRIORITY: FitStatus[] = [
  // Worst → best for picking the overall summary; the first
  // matching axis status wins.
  "tight",
  "very-loose",
  "snug",
  "loose",
  "comfortable",
  "perfect",
];

export type BodyMeasurements = {
  bust: number | null;
  waist: number | null;
  hips: number | null;
};

export type DressMeasurements = {
  bust: string | number | null | undefined;
  waist: string | number | null | undefined;
  hips: string | number | null | undefined;
};

/**
 * Compose the per-axis assessment + overall summary for a
 * body/dress pair. Returns null when no axis has data on both
 * sides — callers should hide the fit card in that case.
 */
export function assessFit(
  body: BodyMeasurements,
  dress: DressMeasurements,
): FitSummary | null {
  const axes: AxisFit[] = [];
  const bust = compareAxis(
    "bust",
    parseInches(body.bust),
    parseInches(dress.bust),
  );
  const waist = compareAxis(
    "waist",
    parseInches(body.waist),
    parseInches(dress.waist),
  );
  const hips = compareAxis(
    "hips",
    parseInches(body.hips),
    parseInches(dress.hips),
  );
  if (bust) axes.push(bust);
  if (waist) axes.push(waist);
  if (hips) axes.push(hips);
  if (axes.length === 0) return null;

  let overall: FitStatus = "perfect";
  for (const s of STATUS_PRIORITY) {
    if (axes.some((a) => a.status === s)) {
      overall = s;
      break;
    }
  }
  return {
    axes,
    overall,
    overallLabel: STATUS_LABELS[overall],
  };
}

/** Tailwind-friendly palette per fit status for the chip + axis
 *  rows. Returned as raw hex so callers can inline without
 *  pulling in any styling system. */
export function fitPalette(status: FitStatus): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case "perfect":
    case "comfortable":
      return { bg: "#dcfce7", fg: "#166534", border: "#86efac" };
    case "snug":
      return { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" };
    case "tight":
      return { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" };
    case "loose":
      return { bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" };
    case "very-loose":
      return { bg: "#e0e7ff", fg: "#3730a3", border: "#a5b4fc" };
  }
}

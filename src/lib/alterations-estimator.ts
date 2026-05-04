/**
 * Alterations cost estimator. Pure data + math — safe to use anywhere.
 *
 * Ranges are Australia-metro 2024 averages from references/stats.md plus
 * common adjacent items (zipper, strap shortening) priced from the same
 * tailor-network sample. Tweak references/stats.md first when pricing
 * drifts, then update the table below.
 */

export type AlterationKind =
  | "hem-simple"
  | "hem-lined"
  | "bust-1-size"
  | "bust-2-sizes"
  | "side-1-size"
  | "side-2-sizes"
  | "bra-cups"
  | "add-straps"
  | "strap-shorten"
  | "bead-repair"
  | "zipper-replace"
  | "bodice-rebuild";

export type AlterationItem = {
  id: AlterationKind;
  label: string;
  /** One-line reminder shown next to the checkbox. */
  description: string;
  /** Low end of the typical range, in cents (AUD). */
  lowCents: number;
  /** High end of the typical range, in cents (AUD). */
  highCents: number;
  /** Show a "consider replacing the dress" warning when selected. */
  flagAsExpensive?: boolean;
};

export const ALTERATION_ITEMS: AlterationItem[] = [
  {
    id: "hem-simple",
    label: "Hem shortening — simple",
    description: "Single-layer chiffon, crepe, or jersey.",
    lowCents: 4000,
    highCents: 7000,
  },
  {
    id: "hem-lined",
    label: "Hem shortening — lined or beaded",
    description: "Multi-layer, lace-trim, or beaded edge.",
    lowCents: 8000,
    highCents: 16000,
  },
  {
    id: "bust-1-size",
    label: "Bust take-in or let-out — 1 size",
    description: "Adjusting bodice darts and side seams.",
    lowCents: 8000,
    highCents: 13000,
  },
  {
    id: "bust-2-sizes",
    label: "Bust take-in or let-out — 2 sizes",
    description: "Bigger reshape; harder if the bust has structure.",
    lowCents: 12000,
    highCents: 18000,
  },
  {
    id: "side-1-size",
    label: "Side seam (waist/hip) — 1 size",
    description: "Take in or let out at the waist or hips.",
    lowCents: 6000,
    highCents: 10000,
  },
  {
    id: "side-2-sizes",
    label: "Side seam (waist/hip) — 2 sizes",
    description: "Bigger reshape; may need lining adjustment too.",
    lowCents: 10000,
    highCents: 15000,
  },
  {
    id: "bra-cups",
    label: "Add bra cups",
    description: "Sewn-in cups to skip the bra.",
    lowCents: 4000,
    highCents: 8000,
  },
  {
    id: "add-straps",
    label: "Add straps to a strapless bodice",
    description: "Spaghetti, regular, or halter conversion.",
    lowCents: 6000,
    highCents: 14000,
  },
  {
    id: "strap-shorten",
    label: "Strap shortening or adjustment",
    description: "Quick fix for too-long straps.",
    lowCents: 3000,
    highCents: 5000,
  },
  {
    id: "bead-repair",
    label: "Bead-thread repair (small area)",
    description: "One pulled section. Per-area pricing.",
    lowCents: 4000,
    highCents: 12000,
  },
  {
    id: "zipper-replace",
    label: "Zipper replacement",
    description: "Hidden invisible zip; bonded or beaded surrounds extra.",
    lowCents: 6000,
    highCents: 12000,
  },
  {
    id: "bodice-rebuild",
    label: "Full bodice rebuild",
    description: "At this point, often cheaper to buy a different dress.",
    lowCents: 20000,
    highCents: 50000,
    flagAsExpensive: true,
  },
];

export const ALTERATIONS_BY_ID: Record<AlterationKind, AlterationItem> =
  Object.fromEntries(
    ALTERATION_ITEMS.map((item) => [item.id, item]),
  ) as Record<AlterationKind, AlterationItem>;

export function isAlterationKind(value: string): value is AlterationKind {
  return value in ALTERATIONS_BY_ID;
}

export type AlterationsResult = {
  selected: AlterationItem[];
  totalLowCents: number;
  totalHighCents: number;
  hasExpensiveFlag: boolean;
};

export function estimateAlterations(
  selectedIds: AlterationKind[],
): AlterationsResult {
  const selected = selectedIds
    .map((id) => ALTERATIONS_BY_ID[id])
    .filter((x): x is AlterationItem => Boolean(x));

  const totalLowCents = selected.reduce((sum, x) => sum + x.lowCents, 0);
  const totalHighCents = selected.reduce((sum, x) => sum + x.highCents, 0);
  const hasExpensiveFlag = selected.some((x) => x.flagAsExpensive);

  return { selected, totalLowCents, totalHighCents, hasExpensiveFlag };
}

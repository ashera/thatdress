// Shared filter types + the activeFilterCount helper. Lives in lib/
// (not in the "use client" listings-filters.tsx) so server modules —
// the /listings page, the browse-filters helper, the count API —
// can import them without crossing the client/server boundary.

export type VisibilityFilter = "all" | "published" | "hidden";

export type ActiveFilters = {
  q?: string;
  designer_id?: string[];
  occasion_id?: string[];
  silhouette_id?: string[];
  size_id?: string[];
  condition_id?: string[];
  length_id?: string[];
  /** Colours are stored as label strings on dresses.color, so the
   *  filter passes labels (not ids) and the SQL WHERE clause matches
   *  the column directly. */
  color?: string[];
  min_price?: string;
  max_price?: string;
  visibility?: VisibilityFilter;
  /** When set via ?trust_status= on the URL, only listings with
   *  that trust status surface in browse. Currently driven by the
   *  buyer's-checklist CTA pointing at /listings?trust_status=verified. */
  trustStatus?: "verified" | "authenticated";
};

export function activeFilterCount(f: ActiveFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.designer_id?.length) n++;
  if (f.occasion_id?.length) n++;
  if (f.silhouette_id?.length) n++;
  if (f.size_id?.length) n++;
  if (f.condition_id?.length) n++;
  if (f.length_id?.length) n++;
  if (f.color?.length) n++;
  if (f.min_price) n++;
  if (f.max_price) n++;
  if (f.visibility && f.visibility !== "all") n++;
  return n;
}

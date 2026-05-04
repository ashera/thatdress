import "server-only";
import { query } from "@/lib/db";

export type RefSchema = "name" | "slug-label";

export type RefTable = {
  /** URL slug used at /admin/reference-data/[key] */
  key: string;
  /** Postgres table name */
  table: string;
  /** Display label (plural) */
  label: string;
  /** Singular noun for "Add a {singular}" */
  singular: string;
  /** Column shape */
  schema: RefSchema;
  /** FK column on listings (for "in-use" counts and delete safety) */
  listingFk?: string;
};

export const REF_TABLES: ReadonlyArray<RefTable> = [
  { key: "designers",        table: "designers",        label: "Designers",         singular: "designer",   schema: "name",       listingFk: "designer_id" },
  { key: "occasions",        table: "occasions",        label: "Occasions",         singular: "occasion",   schema: "slug-label", listingFk: "occasion_id" },
  { key: "silhouettes",      table: "silhouettes",      label: "Silhouettes",       singular: "silhouette", schema: "slug-label", listingFk: "silhouette_id" },
  { key: "fabrics",          table: "fabrics",          label: "Fabrics",           singular: "fabric",     schema: "slug-label", listingFk: "fabric_id" },
  { key: "dress-sizes",      table: "dress_sizes",      label: "Sizes",             singular: "size",       schema: "slug-label", listingFk: "size_id" },
  { key: "necklines",        table: "necklines",        label: "Necklines",         singular: "neckline",   schema: "slug-label", listingFk: "neckline_id" },
  { key: "sleeve-styles",    table: "sleeve_styles",    label: "Sleeve styles",     singular: "sleeve",     schema: "slug-label", listingFk: "sleeve_style_id" },
  { key: "dress-lengths",    table: "dress_lengths",    label: "Lengths",           singular: "length",     schema: "slug-label", listingFk: "length_id" },
  { key: "condition-grades", table: "condition_grades", label: "Condition grades",  singular: "grade",      schema: "slug-label", listingFk: "condition_id" },
];

export function findRefTable(key: string): RefTable | null {
  return REF_TABLES.find((t) => t.key === key) ?? null;
}

export type RefRow = {
  id: string;
  display: string;
  slug: string | null;
  name: string | null;
  label: string | null;
  sort_order: number;
  is_active: boolean;
  in_use: number;
};

export async function listRefRows(t: RefTable): Promise<RefRow[]> {
  const displaySql = t.schema === "name" ? "name" : "label";
  const inUseSql = t.listingFk
    ? `(SELECT COUNT(*) FROM listings WHERE listings.${t.listingFk} = r.id)::int`
    : "0";
  const slugCol = t.schema === "slug-label" ? "slug" : "NULL::text";
  const nameCol = t.schema === "name" ? "name" : "NULL::text";
  const labelCol = t.schema === "slug-label" ? "label" : "NULL::text";

  const result = await query<RefRow>(
    `SELECT r.id::text,
            ${displaySql} AS display,
            ${slugCol} AS slug,
            ${nameCol} AS name,
            ${labelCol} AS label,
            r.sort_order,
            r.is_active,
            ${inUseSql} AS in_use
       FROM ${t.table} r
       ORDER BY r.sort_order, r.id`,
  );
  return result.rows;
}

export type RefOption = { id: string; label: string };

export async function listActiveRefOptions(t: RefTable): Promise<RefOption[]> {
  const displaySql = t.schema === "name" ? "name" : "label";
  const result = await query<{ id: string; label: string }>(
    `SELECT id::text, ${displaySql} AS label
       FROM ${t.table}
      WHERE is_active = TRUE
      ORDER BY sort_order, id`,
  );
  return result.rows;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function addRefRow(
  t: RefTable,
  fields: { display: string; slug?: string; sort_order: number },
): Promise<void> {
  const display = fields.display.trim();
  if (!display) throw new Error("display required");

  if (t.schema === "name") {
    await query(
      `INSERT INTO ${t.table} (name, sort_order) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [display, fields.sort_order],
    );
  } else {
    const slug = (fields.slug?.trim() || slugify(display)) || slugify(display);
    if (!slug) throw new Error("slug required");
    await query(
      `INSERT INTO ${t.table} (slug, label, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, display, fields.sort_order],
    );
  }
}

export async function updateRefRow(
  t: RefTable,
  id: string,
  fields: { display: string; sort_order: number; is_active: boolean },
): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error("invalid id");
  const display = fields.display.trim();
  if (!display) throw new Error("display required");

  const displayCol = t.schema === "name" ? "name" : "label";
  await query(
    `UPDATE ${t.table}
        SET ${displayCol} = $1,
            sort_order = $2,
            is_active = $3
      WHERE id = $4::bigint`,
    [display, fields.sort_order, fields.is_active, id],
  );
}

export async function deleteRefRow(t: RefTable, id: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error("invalid id");
  // FKs on listings use ON DELETE SET NULL, so this is safe even if referenced.
  await query(`DELETE FROM ${t.table} WHERE id = $1::bigint`, [id]);
}

export type ListingRefOptions = {
  designers: RefOption[];
  occasions: RefOption[];
  silhouettes: RefOption[];
  fabrics: RefOption[];
  sizes: RefOption[];
  necklines: RefOption[];
  sleeveStyles: RefOption[];
  lengths: RefOption[];
  conditions: RefOption[];
  regions: RefOption[];
};

export async function loadListingRefOptions(): Promise<ListingRefOptions> {
  const get = (key: string) => {
    const t = findRefTable(key);
    if (!t) return Promise.resolve([] as RefOption[]);
    return listActiveRefOptions(t);
  };
  // Lazy import to avoid a circular dependency between ref-data and regions.
  const { listActiveRegions } = await import("@/lib/regions");
  const [
    designers,
    occasions,
    silhouettes,
    fabrics,
    sizes,
    necklines,
    sleeveStyles,
    lengths,
    conditions,
    regionRows,
  ] = await Promise.all([
    get("designers"),
    get("occasions"),
    get("silhouettes"),
    get("fabrics"),
    get("dress-sizes"),
    get("necklines"),
    get("sleeve-styles"),
    get("dress-lengths"),
    get("condition-grades"),
    listActiveRegions(),
  ]);
  return {
    designers,
    occasions,
    silhouettes,
    fabrics,
    sizes,
    necklines,
    sleeveStyles,
    lengths,
    conditions,
    regions: regionRows.map((r) => ({ id: r.id, label: r.label })),
  };
}

import "server-only";
import { query } from "@/lib/db";

export type RefSchema = "name" | "slug-label";

export type RefUsage = {
  /** Table that carries the FK to this ref table (post-dress-refactor,
   *  most style attributes live on `dresses`, while a couple still
   *  live on `listings`). */
  table: "listings" | "dresses";
  /** FK column on that table. */
  column: string;
};

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
  /** Where the "in use" count comes from. */
  usage?: RefUsage;
};

export const REF_TABLES: ReadonlyArray<RefTable> = [
  { key: "designers",        table: "designers",        label: "Designers",        singular: "designer",   schema: "name",       usage: { table: "dresses",  column: "designer_id" } },
  { key: "occasions",        table: "occasions",        label: "Occasions",        singular: "occasion",   schema: "slug-label", usage: { table: "listings", column: "occasion_id" } },
  { key: "silhouettes",      table: "silhouettes",      label: "Styles",           singular: "style",      schema: "slug-label", usage: { table: "dresses",  column: "silhouette_id" } },
  { key: "fabrics",          table: "fabrics",          label: "Fabrics",          singular: "fabric",     schema: "slug-label", usage: { table: "dresses",  column: "fabric_id" } },
  { key: "dress-sizes",      table: "dress_sizes",      label: "Sizes",            singular: "size",       schema: "slug-label", usage: { table: "dresses",  column: "size_id" } },
  { key: "necklines",        table: "necklines",        label: "Necklines",        singular: "neckline",   schema: "slug-label", usage: { table: "dresses",  column: "neckline_id" } },
  { key: "sleeve-styles",    table: "sleeve_styles",    label: "Sleeve styles",    singular: "sleeve",     schema: "slug-label", usage: { table: "dresses",  column: "sleeve_style_id" } },
  { key: "dress-lengths",    table: "dress_lengths",    label: "Lengths",          singular: "length",     schema: "slug-label", usage: { table: "dresses",  column: "length_id" } },
  { key: "condition-grades", table: "condition_grades", label: "Condition grades", singular: "grade",      schema: "slug-label", usage: { table: "listings", column: "condition_id" } },
  // Colours are stored as the raw label string on dresses.color
  // (text, not FK), so the in-use count would need a label match
  // instead of an FK join. We omit `usage` here — renaming or
  // deleting a colour in admin doesn't break historical listings
  // (they keep the literal string they were saved with).
  { key: "colors",           table: "colors",           label: "Colours",          singular: "colour",     schema: "slug-label" },
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
  is_active: boolean;
  in_use: number;
};

export async function listRefRows(t: RefTable): Promise<RefRow[]> {
  const displaySql = t.schema === "name" ? "name" : "label";
  const inUseSql = t.usage
    ? `(SELECT COUNT(*) FROM ${t.usage.table} WHERE ${t.usage.table}.${t.usage.column} = r.id)::int`
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
            r.is_active,
            ${inUseSql} AS in_use
       FROM ${t.table} r
       ORDER BY LOWER(${displaySql}), r.id`,
  );
  return result.rows;
}

export type RefOption = { id: string; label: string };

export async function listActiveRefOptions(t: RefTable): Promise<RefOption[]> {
  // Every dropdown is alphabetical now — the admin doesn't curate
  // an order any more.
  const displaySql = t.schema === "name" ? "name" : "label";
  const result = await query<{ id: string; label: string }>(
    `SELECT id::text, ${displaySql} AS label
       FROM ${t.table}
      WHERE is_active = TRUE
      ORDER BY LOWER(${displaySql}), id`,
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
  fields: { display: string; slug?: string },
): Promise<void> {
  const display = fields.display.trim();
  if (!display) throw new Error("display required");

  if (t.schema === "name") {
    await query(
      `INSERT INTO ${t.table} (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [display],
    );
  } else {
    const slug = (fields.slug?.trim() || slugify(display)) || slugify(display);
    if (!slug) throw new Error("slug required");
    await query(
      `INSERT INTO ${t.table} (slug, label) VALUES ($1, $2)
       ON CONFLICT (slug) DO NOTHING`,
      [slug, display],
    );
  }
}

export async function updateRefRow(
  t: RefTable,
  id: string,
  fields: {
    display: string;
    is_active: boolean;
    /** Only used for slug-label tables. If blank, the row's existing
     *  slug is kept (we don't auto-regenerate from the new label
     *  because slugs appear in browse URLs and breaking them silently
     *  on a label edit would invalidate bookmarks). */
    slug?: string;
  },
): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error("invalid id");
  const display = fields.display.trim();
  if (!display) throw new Error("display required");

  const displayCol = t.schema === "name" ? "name" : "label";

  if (t.schema === "slug-label") {
    const slugRaw = fields.slug?.trim() ?? "";
    if (slugRaw) {
      const slug = slugify(slugRaw);
      if (!slug) throw new Error("slug required");
      await query(
        `UPDATE ${t.table}
            SET ${displayCol} = $1,
                slug = $2,
                is_active = $3
          WHERE id = $4::bigint`,
        [display, slug, fields.is_active, id],
      );
      return;
    }
    // Slug input was empty — leave the existing slug as-is.
  }

  await query(
    `UPDATE ${t.table}
        SET ${displayCol} = $1,
            is_active = $2
      WHERE id = $3::bigint`,
    [display, fields.is_active, id],
  );
}

export async function deleteRefRow(t: RefTable, id: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error("invalid id");
  // FKs on listings use ON DELETE SET NULL, so this is safe even if referenced.
  await query(`DELETE FROM ${t.table} WHERE id = $1::bigint`, [id]);
}

/** Number of listings/dresses currently using this ref row. Used by
 *  the edit/delete guards in the admin actions so an in-use label
 *  can't be renamed or removed out from under live data. */
export async function countRefUsage(
  t: RefTable,
  id: string,
): Promise<number> {
  if (!t.usage) return 0;
  if (!/^\d+$/.test(id)) return 0;
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
       FROM ${t.usage.table}
      WHERE ${t.usage.column} = $1::bigint`,
    [id],
  );
  return Number(r.rows[0]?.c ?? 0);
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
  colors: RefOption[];
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
    colors,
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
    get("colors"),
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
    colors,
    regions: regionRows.map((r) => ({ id: r.id, label: r.label })),
  };
}

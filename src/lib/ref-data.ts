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
  { key: "bike-makes",       table: "bike_makes",       label: "Bike makes",        singular: "make",        schema: "name",       listingFk: "make_id" },
  { key: "bike-categories",  table: "bike_categories",  label: "Bike categories",   singular: "category",    schema: "slug-label", listingFk: "bike_category_id" },
  { key: "bike-classes",     table: "bike_classes",     label: "Bike classes",      singular: "class",       schema: "slug-label", listingFk: "bike_class_id" },
  { key: "frame-styles",     table: "frame_styles",     label: "Frame styles",      singular: "frame style", schema: "slug-label", listingFk: "frame_style_id" },
  { key: "frame-materials",  table: "frame_materials",  label: "Frame materials",   singular: "material",    schema: "slug-label", listingFk: "frame_material_id" },
  { key: "wheel-sizes",      table: "wheel_sizes",      label: "Wheel sizes",       singular: "wheel size",  schema: "slug-label", listingFk: "wheel_size_id" },
  { key: "gender-fits",      table: "gender_fits",      label: "Gender fits",       singular: "fit",         schema: "slug-label", listingFk: "gender_fit_id" },
  { key: "motor-brands",     table: "motor_brands",     label: "Motor brands",      singular: "brand",       schema: "name",       listingFk: "motor_brand_id" },
  { key: "motor-types",      table: "motor_types",      label: "Motor types",       singular: "type",        schema: "slug-label", listingFk: "motor_type_id" },
  { key: "drive-modes",      table: "drive_modes",      label: "Drive modes",       singular: "mode",        schema: "slug-label", listingFk: "drive_mode_id" },
  { key: "brake-types",      table: "brake_types",      label: "Brake types",       singular: "type",        schema: "slug-label", listingFk: "brake_type_id" },
  { key: "suspension-types", table: "suspension_types", label: "Suspension types",  singular: "type",        schema: "slug-label", listingFk: "suspension_type_id" },
  { key: "condition-grades", table: "condition_grades", label: "Condition grades",  singular: "grade",       schema: "slug-label", listingFk: "condition_id" },
  { key: "body-positions",   table: "body_positions",   label: "Body positions",    singular: "position",    schema: "slug-label", listingFk: "body_position_id" },
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
  makes: RefOption[];
  categories: RefOption[];
  classes: RefOption[];
  conditions: RefOption[];
  frameStyles: RefOption[];
  frameMaterials: RefOption[];
  wheelSizes: RefOption[];
  genderFits: RefOption[];
  suspensionTypes: RefOption[];
  brakeTypes: RefOption[];
  motorBrands: RefOption[];
  motorTypes: RefOption[];
  driveModes: RefOption[];
  bodyPositions: RefOption[];
};

export async function loadListingRefOptions(): Promise<ListingRefOptions> {
  const get = (key: string) => {
    const t = findRefTable(key);
    if (!t) return Promise.resolve([] as RefOption[]);
    return listActiveRefOptions(t);
  };
  const [
    makes,
    categories,
    classes,
    conditions,
    frameStyles,
    frameMaterials,
    wheelSizes,
    genderFits,
    suspensionTypes,
    brakeTypes,
    motorBrands,
    motorTypes,
    driveModes,
    bodyPositions,
  ] = await Promise.all([
    get("bike-makes"),
    get("bike-categories"),
    get("bike-classes"),
    get("condition-grades"),
    get("frame-styles"),
    get("frame-materials"),
    get("wheel-sizes"),
    get("gender-fits"),
    get("suspension-types"),
    get("brake-types"),
    get("motor-brands"),
    get("motor-types"),
    get("drive-modes"),
    get("body-positions"),
  ]);
  return {
    makes,
    categories,
    classes,
    conditions,
    frameStyles,
    frameMaterials,
    wheelSizes,
    genderFits,
    suspensionTypes,
    brakeTypes,
    motorBrands,
    motorTypes,
    driveModes,
    bodyPositions,
  };
}

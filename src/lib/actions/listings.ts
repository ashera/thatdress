"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const PRICE_MAX_DOLLARS = 1_000_000;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_LISTING = 10;
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CURRENT_YEAR = new Date().getUTCFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = CURRENT_YEAR + 1;

type Range = { min: number; max: number };
const RANGES: Record<string, Range> = {
  motor_watts_nominal: { min: 50, max: 3000 },
  motor_watts_peak: { min: 0, max: 5000 },
  motor_torque_nm: { min: 0, max: 300 },
  battery_wh: { min: 50, max: 5000 },
  battery_voltage: { min: 0, max: 120 },
  battery_amp_hours: { min: 0, max: 50 },
  charge_time_hours: { min: 0, max: 24 },
  top_speed_mph: { min: 0, max: 60 },
  range_miles_min: { min: 0, max: 400 },
  range_miles_max: { min: 0, max: 400 },
  mileage: { min: 0, max: 100000 },
  weight_lbs: { min: 0, max: 500 },
};

function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  if (dollars > PRICE_MAX_DOLLARS) return null;
  return Math.round(dollars * 100);
}

function getString(formData: FormData, key: string, max?: number): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (max && raw.length > max) return raw.slice(0, max);
  return raw;
}

function nullableString(raw: string): string | null {
  return raw.length === 0 ? null : raw;
}

function getOptionalId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

function getRequiredId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return raw;
}

function getOptionalInt(
  formData: FormData,
  key: string,
): number | null | "out-of-range" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return "out-of-range";
  const r = RANGES[key];
  if (r && (n < r.min || n > r.max)) return "out-of-range";
  return n;
}

function getOptionalNumber(
  formData: FormData,
  key: string,
): number | null | "out-of-range" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return "out-of-range";
  const r = RANGES[key];
  if (r && (n < r.min || n > r.max)) return "out-of-range";
  return n;
}

function getCheckbox(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true";
}

type ListingFields = {
  title: string;
  description: string | null;
  price_cents: number;
  make_id: string;
  model: string;
  year: number;
  condition_id: string;
  bike_class_id: string;
  bike_category_id: string;
  location_postal: string;
  frame_size: string | null;
  frame_style_id: string | null;
  frame_material_id: string | null;
  gender_fit_id: string | null;
  wheel_size_id: string | null;
  suspension_type_id: string | null;
  brake_type_id: string | null;
  motor_brand_id: string | null;
  motor_type_id: string | null;
  motor_watts_nominal: number | null;
  motor_watts_peak: number | null;
  motor_torque_nm: number | null;
  battery_wh: number | null;
  battery_voltage: number | null;
  battery_amp_hours: number | null;
  charge_time_hours: number | null;
  top_speed_mph: number | null;
  range_miles_min: number | null;
  range_miles_max: number | null;
  drive_mode_id: string | null;
  mileage: number | null;
  color: string | null;
  weight_lbs: number | null;
  display_type: string | null;
  drivetrain: string | null;
  accessories: string | null;
  modifications: string | null;
  has_warranty: boolean;
  warranty_text: string | null;
  has_original_receipt: boolean;
  body_position_id: string | null;
};

type ParseResult =
  | { ok: true; fields: ListingFields }
  | { ok: false; error: string };

function parseListingFields(formData: FormData): ParseResult {
  const title = getString(formData, "title", TITLE_MAX);
  if (!title) return { ok: false, error: "invalid-title" };

  const description = getString(formData, "description", DESCRIPTION_MAX);
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, error: "long-description" };
  }

  const priceCents = parsePriceToCents(getString(formData, "price"));
  if (priceCents === null) return { ok: false, error: "invalid-price" };

  const make_id = getRequiredId(formData, "make_id");
  if (!make_id) return { ok: false, error: "invalid-make" };

  const model = getString(formData, "model", 100);
  if (!model) return { ok: false, error: "invalid-model" };

  const yearRaw = getString(formData, "year");
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return { ok: false, error: "invalid-year" };
  }

  const condition_id = getRequiredId(formData, "condition_id");
  if (!condition_id) return { ok: false, error: "invalid-condition" };

  const bike_class_id = getRequiredId(formData, "bike_class_id");
  if (!bike_class_id) return { ok: false, error: "invalid-class" };

  const bike_category_id = getRequiredId(formData, "bike_category_id");
  if (!bike_category_id) return { ok: false, error: "invalid-category" };

  const location_postal = getString(formData, "location_postal", 64);
  if (!location_postal) return { ok: false, error: "invalid-location" };

  // Optional integers with range validation.
  const intFields = [
    "motor_watts_nominal",
    "motor_watts_peak",
    "motor_torque_nm",
    "battery_wh",
    "battery_voltage",
    "top_speed_mph",
    "range_miles_min",
    "range_miles_max",
    "mileage",
  ] as const;
  const ints: Record<string, number | null> = {};
  for (const f of intFields) {
    const v = getOptionalInt(formData, f);
    if (v === "out-of-range") return { ok: false, error: "out-of-range" };
    ints[f] = v;
  }

  const numFields = ["battery_amp_hours", "charge_time_hours", "weight_lbs"] as const;
  const nums: Record<string, number | null> = {};
  for (const f of numFields) {
    const v = getOptionalNumber(formData, f);
    if (v === "out-of-range") return { ok: false, error: "out-of-range" };
    nums[f] = v;
  }

  return {
    ok: true,
    fields: {
      title,
      description: nullableString(description),
      price_cents: priceCents,
      make_id,
      model,
      year,
      condition_id,
      bike_class_id,
      bike_category_id,
      location_postal,
      frame_size: nullableString(getString(formData, "frame_size", 32)),
      frame_style_id: getOptionalId(formData, "frame_style_id"),
      frame_material_id: getOptionalId(formData, "frame_material_id"),
      gender_fit_id: getOptionalId(formData, "gender_fit_id"),
      wheel_size_id: getOptionalId(formData, "wheel_size_id"),
      suspension_type_id: getOptionalId(formData, "suspension_type_id"),
      brake_type_id: getOptionalId(formData, "brake_type_id"),
      motor_brand_id: getOptionalId(formData, "motor_brand_id"),
      motor_type_id: getOptionalId(formData, "motor_type_id"),
      motor_watts_nominal: ints.motor_watts_nominal,
      motor_watts_peak: ints.motor_watts_peak,
      motor_torque_nm: ints.motor_torque_nm,
      battery_wh: ints.battery_wh,
      battery_voltage: ints.battery_voltage,
      battery_amp_hours: nums.battery_amp_hours,
      charge_time_hours: nums.charge_time_hours,
      top_speed_mph: ints.top_speed_mph,
      range_miles_min: ints.range_miles_min,
      range_miles_max: ints.range_miles_max,
      drive_mode_id: getOptionalId(formData, "drive_mode_id"),
      mileage: ints.mileage,
      color: nullableString(getString(formData, "color", 32)),
      weight_lbs: nums.weight_lbs,
      display_type: nullableString(getString(formData, "display_type", 64)),
      drivetrain: nullableString(getString(formData, "drivetrain", 120)),
      accessories: nullableString(getString(formData, "accessories", 2000)),
      modifications: nullableString(getString(formData, "modifications", 2000)),
      has_warranty: getCheckbox(formData, "has_warranty"),
      warranty_text: nullableString(getString(formData, "warranty_text", 500)),
      has_original_receipt: getCheckbox(formData, "has_original_receipt"),
      body_position_id: getOptionalId(formData, "body_position_id"),
    },
  };
}

function listingValuesForInsert(f: ListingFields, sellerId: string) {
  return [
    f.title,
    f.description,
    f.price_cents,
    sellerId,
    f.make_id,
    f.model,
    f.year,
    f.condition_id,
    f.bike_class_id,
    f.bike_category_id,
    f.location_postal,
    f.frame_size,
    f.frame_style_id,
    f.frame_material_id,
    f.gender_fit_id,
    f.wheel_size_id,
    f.suspension_type_id,
    f.brake_type_id,
    f.motor_brand_id,
    f.motor_type_id,
    f.motor_watts_nominal,
    f.motor_watts_peak,
    f.motor_torque_nm,
    f.battery_wh,
    f.battery_voltage,
    f.battery_amp_hours,
    f.charge_time_hours,
    f.top_speed_mph,
    f.range_miles_min,
    f.range_miles_max,
    f.drive_mode_id,
    f.mileage,
    f.color,
    f.weight_lbs,
    f.display_type,
    f.drivetrain,
    f.accessories,
    f.modifications,
    f.has_warranty,
    f.warranty_text,
    f.has_original_receipt,
    f.body_position_id,
  ];
}

const INSERT_COLUMNS = `
  title, description, price_cents, seller_id,
  make_id, model, year, condition_id, bike_class_id, bike_category_id,
  location_postal, frame_size, frame_style_id, frame_material_id,
  gender_fit_id, wheel_size_id, suspension_type_id, brake_type_id,
  motor_brand_id, motor_type_id, motor_watts_nominal, motor_watts_peak,
  motor_torque_nm, battery_wh, battery_voltage, battery_amp_hours,
  charge_time_hours, top_speed_mph, range_miles_min, range_miles_max,
  drive_mode_id, mileage, color, weight_lbs, display_type, drivetrain,
  accessories, modifications, has_warranty, warranty_text,
  has_original_receipt, body_position_id, region_id
`;

const UPDATE_SET = `
  title = $2,
  description = $3,
  price_cents = $4,
  make_id = $5::bigint,
  model = $6,
  year = $7,
  condition_id = $8::bigint,
  bike_class_id = $9::bigint,
  bike_category_id = $10::bigint,
  location_postal = $11,
  frame_size = $12,
  frame_style_id = NULLIF($13, '')::bigint,
  frame_material_id = NULLIF($14, '')::bigint,
  gender_fit_id = NULLIF($15, '')::bigint,
  wheel_size_id = NULLIF($16, '')::bigint,
  suspension_type_id = NULLIF($17, '')::bigint,
  brake_type_id = NULLIF($18, '')::bigint,
  motor_brand_id = NULLIF($19, '')::bigint,
  motor_type_id = NULLIF($20, '')::bigint,
  motor_watts_nominal = $21,
  motor_watts_peak = $22,
  motor_torque_nm = $23,
  battery_wh = $24,
  battery_voltage = $25,
  battery_amp_hours = $26,
  charge_time_hours = $27,
  top_speed_mph = $28,
  range_miles_min = $29,
  range_miles_max = $30,
  drive_mode_id = NULLIF($31, '')::bigint,
  mileage = $32,
  color = $33,
  weight_lbs = $34,
  display_type = $35,
  drivetrain = $36,
  accessories = $37,
  modifications = $38,
  has_warranty = $39,
  warranty_text = $40,
  has_original_receipt = $41,
  body_position_id = NULLIF($42, '')::bigint,
  region_id = NULLIF($43, '')::bigint
`;

function collectImageFiles(formData: FormData): File[] {
  const files = formData
    .getAll("images")
    .filter((v): v is File => v instanceof File && v.size > 0);
  return files;
}

type ImageError = "too-many" | "too-large" | "bad-type";

function validateImages(files: File[]): ImageError | null {
  if (files.length > MAX_IMAGES_PER_LISTING) return "too-many";
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) return "too-large";
    if (!ALLOWED_IMAGE_MIMES.has(f.type)) return "bad-type";
  }
  return null;
}

async function insertImages(
  listingId: string,
  files: File[],
  startPosition: number,
  hasExistingPrimary: boolean,
): Promise<void> {
  if (files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buf = Buffer.from(await f.arrayBuffer());
    const isPrimary = !hasExistingPrimary && i === 0;
    await query(
      `INSERT INTO listing_images
        (listing_id, mime_type, bytes, byte_size, position, is_primary)
       VALUES ($1::bigint, $2, $3, $4, $5, $6)`,
      [listingId, f.type, buf, f.size, startPosition + i, isPrimary],
    );
    if (isPrimary) hasExistingPrimary = true;
  }
}

export async function createListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?error=invalid-credentials");
  }

  const parsed = parseListingFields(formData);
  if (!parsed.ok) {
    redirect(`/listings/new?error=${parsed.error}`);
  }

  const files = collectImageFiles(formData);
  const imageErr = validateImages(files);
  if (imageErr) redirect(`/listings/new?error=${imageErr}`);

  // Region: form value wins; fall back to the seller's current session
  // region for safety (the form makes it required, but admins can submit
  // without one if no region is configured).
  const formRegionId = String(formData.get("region_id") ?? "").trim();
  const regionId = /^\d+$/.test(formRegionId)
    ? formRegionId
    : await getCurrentRegionId();

  const values = listingValuesForInsert(parsed.fields, user.id);
  values.push(regionId);
  const placeholders = Array.from({ length: values.length }, (_, i) => `$${i + 1}`).join(
    ", ",
  );
  const inserted = await query<{ id: string }>(
    `INSERT INTO listings (${INSERT_COLUMNS}) VALUES (${placeholders}) RETURNING id::text`,
    values,
  );
  const listingId = inserted.rows[0]!.id;

  try {
    await insertImages(listingId, files, 0, false);
  } catch {
    revalidatePath("/listings");
    redirect(`/listings/${listingId}/edit?error=upload-failed`);
  }

  revalidatePath("/listings");
  redirect(`/listings/${listingId}`);
}

export async function setListingVisibility(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await canEditListing(listingId, user))) {
    redirect("/listings");
  }

  const isPublished = formData.get("is_published") === "on";

  await query(
    `UPDATE listings
        SET is_published = $1
      WHERE id = $2::bigint
        AND (seller_id = $3::bigint OR $4::boolean)`,
    [isPublished, listingId, user.id, user.isAdmin],
  );

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/listings/mine`);
  redirect(`/listings/${listingId}/edit?vis=1`);
}

async function ensureListingOwner(
  listingId: string,
  userId: string,
): Promise<boolean> {
  if (!/^\d+$/.test(listingId)) return false;
  const r = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  return r.rows[0]?.seller_id === userId;
}

async function canEditListing(
  listingId: string,
  user: { id: string; isAdmin: boolean },
): Promise<boolean> {
  if (!/^\d+$/.test(listingId)) return false;
  if (user.isAdmin) {
    const r = await query<{ id: string }>(
      `SELECT id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
      [listingId],
    );
    return r.rows.length > 0;
  }
  return ensureListingOwner(listingId, user.id);
}

export async function updateListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await canEditListing(listingId, user))) {
    redirect("/listings");
  }

  const parsed = parseListingFields(formData);
  if (!parsed.ok) {
    redirect(`/listings/${listingId}/edit?error=${parsed.error}`);
  }

  const f = parsed.fields;
  const formRegionId = String(formData.get("region_id") ?? "").trim();
  const regionId = /^\d+$/.test(formRegionId)
    ? formRegionId
    : ((await getCurrentRegionId()) ?? "");

  // Admins can edit any listing; sellers can only edit their own. The
  // OR clause makes admin a no-op gate while preserving the seller_id
  // constraint for non-admin updates.
  await query(
    `UPDATE listings SET ${UPDATE_SET}
      WHERE id = $1::bigint
        AND (seller_id = $44::bigint OR $45::boolean)`,
    [
      listingId,
      f.title,
      f.description,
      f.price_cents,
      f.make_id,
      f.model,
      f.year,
      f.condition_id,
      f.bike_class_id,
      f.bike_category_id,
      f.location_postal,
      f.frame_size,
      f.frame_style_id ?? "",
      f.frame_material_id ?? "",
      f.gender_fit_id ?? "",
      f.wheel_size_id ?? "",
      f.suspension_type_id ?? "",
      f.brake_type_id ?? "",
      f.motor_brand_id ?? "",
      f.motor_type_id ?? "",
      f.motor_watts_nominal,
      f.motor_watts_peak,
      f.motor_torque_nm,
      f.battery_wh,
      f.battery_voltage,
      f.battery_amp_hours,
      f.charge_time_hours,
      f.top_speed_mph,
      f.range_miles_min,
      f.range_miles_max,
      f.drive_mode_id ?? "",
      f.mileage,
      f.color,
      f.weight_lbs,
      f.display_type,
      f.drivetrain,
      f.accessories,
      f.modifications,
      f.has_warranty,
      f.warranty_text,
      f.has_original_receipt,
      f.body_position_id ?? "",
      regionId,
      user.id,
      user.isAdmin,
    ],
  );

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  redirect(`/listings/${listingId}/edit?saved=1`);
}

export async function addListingImages(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await canEditListing(listingId, user))) {
    redirect("/listings");
  }

  const files = collectImageFiles(formData);
  if (files.length === 0) {
    redirect(`/listings/${listingId}/edit?error=no-files`);
  }

  const counts = await query<{ existing: string; has_primary: string }>(
    `SELECT
        COUNT(*)::text                                AS existing,
        COUNT(*) FILTER (WHERE is_primary)::text      AS has_primary
       FROM listing_images
      WHERE listing_id = $1::bigint`,
    [listingId],
  );
  const existing = Number(counts.rows[0]?.existing ?? 0);
  const hasPrimary = Number(counts.rows[0]?.has_primary ?? 0) > 0;

  if (existing + files.length > MAX_IMAGES_PER_LISTING) {
    redirect(`/listings/${listingId}/edit?error=too-many`);
  }
  const imageErr = validateImages(files);
  if (imageErr) redirect(`/listings/${listingId}/edit?error=${imageErr}`);

  await insertImages(listingId, files, existing, hasPrimary);

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  redirect(`/listings/${listingId}/edit`);
}

export async function setPrimaryImage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (!/^\d+$/.test(imageId)) redirect("/listings");
  if (!(await canEditListing(listingId, user))) redirect("/listings");

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE listing_images SET is_primary = FALSE
        WHERE listing_id = $1::bigint AND is_primary = TRUE`,
      [listingId],
    );
    await client.query(
      `UPDATE listing_images SET is_primary = TRUE
        WHERE id = $1::bigint AND listing_id = $2::bigint`,
      [imageId, listingId],
    );
  });

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  redirect(`/listings/${listingId}/edit`);
}

export async function deleteListingImage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (!/^\d+$/.test(imageId)) redirect("/listings");
  if (!(await canEditListing(listingId, user))) redirect("/listings");

  const r = await query<{ was_primary: boolean }>(
    `DELETE FROM listing_images
       WHERE id = $1::bigint AND listing_id = $2::bigint
       RETURNING is_primary AS was_primary`,
    [imageId, listingId],
  );

  if (r.rows[0]?.was_primary) {
    await query(
      `UPDATE listing_images
          SET is_primary = TRUE
        WHERE id = (
          SELECT id FROM listing_images
            WHERE listing_id = $1::bigint
            ORDER BY position, id
            LIMIT 1
        )`,
      [listingId],
    );
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  redirect(`/listings/${listingId}/edit`);
}

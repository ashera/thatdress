"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
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
  if (!raw || !/^\d+$/.test(raw)) return null;
  return raw;
}

function getRequiredId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return raw;
}

function getOptionalIntInRange(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null | "out-of-range" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return "out-of-range";
  return n;
}

function getOptionalNumberInRange(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): number | null | "out-of-range" {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < min || n > max) return "out-of-range";
  return n;
}

function getCheckbox(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true";
}

function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  if (dollars > PRICE_MAX_DOLLARS) return null;
  return Math.round(dollars * 100);
}

async function ensureDraftOwnership(
  listingId: string,
  user: { id: string; isAdmin: boolean },
): Promise<boolean> {
  if (!/^\d+$/.test(listingId)) return false;
  const r = await query<{ seller_id: string | null; is_draft: boolean }>(
    `SELECT seller_id::text, is_draft FROM listings
      WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) return false;
  if (!row.is_draft) return false;
  return user.isAdmin || row.seller_id === user.id;
}

export async function startDraftListing(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const regionId = await getCurrentRegionId();

  const r = await query<{ id: string }>(
    `INSERT INTO listings
       (title, price_cents, seller_id, is_draft, is_published, region_id)
     VALUES ('', 0, $1::bigint, TRUE, FALSE, $2)
     RETURNING id::text`,
    [user.id, regionId],
  );
  const listingId = r.rows[0]!.id;
  redirect(`/listings/new/${listingId}/photos`);
}

export async function abandonDraftListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  await query(
    `DELETE FROM listings
      WHERE id = $1::bigint
        AND is_draft = TRUE
        AND (seller_id = $2::bigint OR $3::boolean)`,
    [listingId, user.id, user.isAdmin],
  );

  revalidatePath("/listings/mine");
  redirect("/listings/mine");
}

function collectImageFiles(formData: FormData): File[] {
  return formData
    .getAll("images")
    .filter((v): v is File => v instanceof File && v.size > 0);
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

async function appendImages(
  listingId: string,
  files: File[],
): Promise<void> {
  if (files.length === 0) return;
  const counts = await query<{ existing: string; has_primary: string }>(
    `SELECT
        COUNT(*)::text                           AS existing,
        COUNT(*) FILTER (WHERE is_primary)::text AS has_primary
       FROM listing_images
      WHERE listing_id = $1::bigint`,
    [listingId],
  );
  let position = Number(counts.rows[0]?.existing ?? 0);
  let hasPrimary = Number(counts.rows[0]?.has_primary ?? 0) > 0;

  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const isPrimary = !hasPrimary;
    await query(
      `INSERT INTO listing_images
        (listing_id, mime_type, bytes, byte_size, position, is_primary)
       VALUES ($1::bigint, $2, $3, $4, $5, $6)`,
      [listingId, f.type, buf, f.size, position, isPrimary],
    );
    position += 1;
    if (isPrimary) hasPrimary = true;
  }
}

export async function saveDraftPhotos(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/photos`;

  const title = getString(formData, "title", TITLE_MAX);
  if (!title) redirect(`${stepUrl}?error=invalid-title`);

  const make_id = getRequiredId(formData, "make_id");
  if (!make_id) redirect(`${stepUrl}?error=invalid-make`);

  const model = getString(formData, "model", 100);
  if (!model) redirect(`${stepUrl}?error=invalid-model`);

  const yearRaw = getString(formData, "year");
  const year = Number.parseInt(yearRaw, 10);
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) {
    redirect(`${stepUrl}?error=invalid-year`);
  }

  const files = collectImageFiles(formData);
  const imageErr = validateImages(files);
  if (imageErr) redirect(`${stepUrl}?error=${imageErr}`);

  await query(
    `UPDATE listings
        SET title = $2,
            make_id = $3::bigint,
            model = $4,
            year = $5
      WHERE id = $1::bigint`,
    [listingId, title, make_id, model, year],
  );

  if (files.length > 0) {
    try {
      await appendImages(listingId, files);
    } catch {
      redirect(`${stepUrl}?error=upload-failed`);
    }
  }

  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/build`);
}

export async function saveDraftBuild(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/build`;

  const bike_class_id = getRequiredId(formData, "bike_class_id");
  if (!bike_class_id) redirect(`${stepUrl}?error=invalid-class`);
  const bike_category_id = getRequiredId(formData, "bike_category_id");
  if (!bike_category_id) redirect(`${stepUrl}?error=invalid-category`);

  const intRanges: Record<string, [number, number]> = {
    motor_watts_nominal: [50, 3000],
    battery_wh: [50, 5000],
    top_speed_mph: [0, 100],
    range_miles_min: [0, 600],
    range_miles_max: [0, 600],
    mileage: [0, 160000],
  };
  const ints: Record<string, number | null> = {};
  for (const [k, [min, max]] of Object.entries(intRanges)) {
    const v = getOptionalIntInRange(formData, k, min, max);
    if (v === "out-of-range") redirect(`${stepUrl}?error=out-of-range`);
    ints[k] = v;
  }
  const weight = getOptionalNumberInRange(formData, "weight_lbs", 0, 250);
  if (weight === "out-of-range") redirect(`${stepUrl}?error=out-of-range`);

  await query(
    `UPDATE listings
        SET bike_class_id = $2::bigint,
            bike_category_id = $3::bigint,
            frame_size = $4,
            frame_style_id = NULLIF($5, '')::bigint,
            frame_material_id = NULLIF($6, '')::bigint,
            gender_fit_id = NULLIF($7, '')::bigint,
            wheel_size_id = NULLIF($8, '')::bigint,
            suspension_type_id = NULLIF($9, '')::bigint,
            brake_type_id = NULLIF($10, '')::bigint,
            motor_brand_id = NULLIF($11, '')::bigint,
            motor_type_id = NULLIF($12, '')::bigint,
            motor_watts_nominal = $13,
            battery_wh = $14,
            top_speed_mph = $15,
            range_miles_min = $16,
            range_miles_max = $17,
            drive_mode_id = NULLIF($18, '')::bigint,
            mileage = $19,
            color = $20,
            weight_lbs = $21
      WHERE id = $1::bigint`,
    [
      listingId,
      bike_class_id,
      bike_category_id,
      nullableString(getString(formData, "frame_size", 32)),
      getOptionalId(formData, "frame_style_id") ?? "",
      getOptionalId(formData, "frame_material_id") ?? "",
      getOptionalId(formData, "gender_fit_id") ?? "",
      getOptionalId(formData, "wheel_size_id") ?? "",
      getOptionalId(formData, "suspension_type_id") ?? "",
      getOptionalId(formData, "brake_type_id") ?? "",
      getOptionalId(formData, "motor_brand_id") ?? "",
      getOptionalId(formData, "motor_type_id") ?? "",
      ints.motor_watts_nominal,
      ints.battery_wh,
      ints.top_speed_mph,
      ints.range_miles_min,
      ints.range_miles_max,
      getOptionalId(formData, "drive_mode_id") ?? "",
      ints.mileage,
      nullableString(getString(formData, "color", 32)),
      weight,
    ],
  );

  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/condition`);
}

export async function saveDraftCondition(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/condition`;

  const condition_id = getRequiredId(formData, "condition_id");
  if (!condition_id) redirect(`${stepUrl}?error=invalid-condition`);

  await query(
    `UPDATE listings
        SET condition_id = $2::bigint,
            has_warranty = $3,
            warranty_text = $4,
            has_original_receipt = $5,
            accessories = $6,
            modifications = $7
      WHERE id = $1::bigint`,
    [
      listingId,
      condition_id,
      getCheckbox(formData, "has_warranty"),
      nullableString(getString(formData, "warranty_text", 500)),
      getCheckbox(formData, "has_original_receipt"),
      nullableString(getString(formData, "accessories", 2000)),
      nullableString(getString(formData, "modifications", 2000)),
    ],
  );

  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/publish`);
}

export async function publishDraftListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/publish`;

  const description = getString(formData, "description", DESCRIPTION_MAX);
  const priceCents = parsePriceToCents(getString(formData, "price"));
  if (priceCents === null) redirect(`${stepUrl}?error=invalid-price`);

  const location_postal = getString(formData, "location_postal", 64);
  if (!location_postal) redirect(`${stepUrl}?error=invalid-location`);

  const formRegionId = String(formData.get("region_id") ?? "").trim();
  const regionId = /^\d+$/.test(formRegionId)
    ? formRegionId
    : await getCurrentRegionId();

  // Final readiness check: everything required by parseListingFields must
  // be present on the row. Fail back to the relevant step if not.
  const r = await query<{
    title: string | null;
    make_id: string | null;
    model: string | null;
    year: number | null;
    bike_class_id: string | null;
    bike_category_id: string | null;
    condition_id: string | null;
  }>(
    `SELECT title,
            make_id::text,
            model,
            year,
            bike_class_id::text,
            bike_category_id::text,
            condition_id::text
       FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) redirect("/listings/mine");
  if (!row.title || !row.make_id || !row.model || !row.year) {
    redirect(`/listings/new/${listingId}/photos?error=incomplete`);
  }
  if (!row.bike_class_id || !row.bike_category_id) {
    redirect(`/listings/new/${listingId}/build?error=incomplete`);
  }
  if (!row.condition_id) {
    redirect(`/listings/new/${listingId}/condition?error=incomplete`);
  }

  await query(
    `UPDATE listings
        SET description = $2,
            price_cents = $3,
            location_postal = $4,
            region_id = NULLIF($5, '')::bigint,
            offers_enabled = $6,
            is_draft = FALSE,
            is_published = TRUE
      WHERE id = $1::bigint`,
    [
      listingId,
      nullableString(description),
      priceCents,
      location_postal,
      regionId ?? "",
      getCheckbox(formData, "offers_enabled"),
    ],
  );

  revalidatePath("/listings");
  revalidatePath("/listings/mine");
  redirect(`/listings/${listingId}`);
}

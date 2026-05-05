"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { deriveTrustStatus, isTrustStatus } from "@/lib/listing-trust";
import { recomputeListingTrustStatus } from "@/lib/listing-trust-server";
import { loadSiteSettings } from "@/lib/site-settings";

const DESCRIPTION_MAX = 5000;
const PRICE_MAX_DOLLARS = 1_000_000;
const ALTERATIONS_MAX = 2000;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_LISTING = 10;
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CURRENT_YEAR = new Date().getUTCFullYear();
const MIN_YEAR = 1990;
const MAX_YEAR = CURRENT_YEAR + 1;

type Range = { min: number; max: number };
const RANGES: Record<string, Range> = {
  bust_inches: { min: 20, max: 70 },
  waist_inches: { min: 18, max: 70 },
  hips_inches: { min: 24, max: 80 },
  original_retail_cents: { min: 0, max: 100_000_000 },
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
  description: string | null;
  price_cents: number;
  designer_id: string;
  model: string;
  year: number | null;
  condition_id: string;
  occasion_id: string;
  location_postal: string;
  silhouette_id: string | null;
  fabric_id: string | null;
  size_id: string | null;
  neckline_id: string | null;
  sleeve_style_id: string | null;
  length_id: string | null;
  color: string | null;
  bust_inches: number | null;
  waist_inches: number | null;
  hips_inches: number | null;
  original_retail_cents: number | null;
  alterations_text: string | null;
  has_original_receipt: boolean;
  is_authentic_declared: boolean;
  includes_label_lining_photos: boolean;
  offers_enabled: boolean;
};

type ParseResult =
  | { ok: true; fields: ListingFields }
  | { ok: false; error: string };

function parseListingFields(formData: FormData): ParseResult {
  // Title is derived from designer + model in SQL — sellers don't supply it.
  const description = getString(formData, "description", DESCRIPTION_MAX);
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, error: "long-description" };
  }

  const priceCents = parsePriceToCents(getString(formData, "price"));
  if (priceCents === null) return { ok: false, error: "invalid-price" };

  const designer_id = getRequiredId(formData, "designer_id");
  if (!designer_id) return { ok: false, error: "invalid-designer" };

  const model = getString(formData, "model", 100);
  if (!model) return { ok: false, error: "invalid-model" };

  const yearRaw = getString(formData, "year");
  let year: number | null = null;
  if (yearRaw) {
    const y = Number.parseInt(yearRaw, 10);
    if (!Number.isFinite(y) || y < MIN_YEAR || y > MAX_YEAR) {
      return { ok: false, error: "invalid-year" };
    }
    year = y;
  }

  const condition_id = getRequiredId(formData, "condition_id");
  if (!condition_id) return { ok: false, error: "invalid-condition" };

  const occasion_id = getRequiredId(formData, "occasion_id");
  if (!occasion_id) return { ok: false, error: "invalid-occasion" };

  const location_postal = getString(formData, "location_postal", 64);
  if (!location_postal) return { ok: false, error: "invalid-location" };

  const measureFields = [
    "bust_inches",
    "waist_inches",
    "hips_inches",
  ] as const;
  const measures: Record<string, number | null> = {};
  for (const f of measureFields) {
    const v = getOptionalNumber(formData, f);
    if (v === "out-of-range") return { ok: false, error: "out-of-range" };
    measures[f] = v;
  }

  // Original retail is entered in dollars but stored in cents.
  const retailRaw = getString(formData, "original_retail");
  let original_retail_cents: number | null = null;
  if (retailRaw) {
    const cents = parsePriceToCents(retailRaw);
    if (cents === null) return { ok: false, error: "out-of-range" };
    original_retail_cents = cents;
  }

  return {
    ok: true,
    fields: {
      description: nullableString(description),
      price_cents: priceCents,
      designer_id,
      model,
      year,
      condition_id,
      occasion_id,
      location_postal,
      silhouette_id: getOptionalId(formData, "silhouette_id"),
      fabric_id: getOptionalId(formData, "fabric_id"),
      size_id: getOptionalId(formData, "size_id"),
      neckline_id: getOptionalId(formData, "neckline_id"),
      sleeve_style_id: getOptionalId(formData, "sleeve_style_id"),
      length_id: getOptionalId(formData, "length_id"),
      color: nullableString(getString(formData, "color", 32)),
      bust_inches: measures.bust_inches,
      waist_inches: measures.waist_inches,
      hips_inches: measures.hips_inches,
      original_retail_cents,
      alterations_text: nullableString(
        getString(formData, "alterations_text", ALTERATIONS_MAX),
      ),
      has_original_receipt: getCheckbox(formData, "has_original_receipt"),
      is_authentic_declared: getCheckbox(formData, "is_authentic_declared"),
      includes_label_lining_photos: getCheckbox(
        formData,
        "includes_label_lining_photos",
      ),
      offers_enabled: getCheckbox(formData, "offers_enabled"),
    },
  };
}

// Title is auto-derived from designer + model in a follow-up query so we
// don't have to share a parameter slot across multiple type contexts.
const UPDATE_SET = `
  description = $2,
  price_cents = $3,
  designer_id = $4::bigint,
  model = $5,
  year = $6,
  condition_id = $7::bigint,
  occasion_id = $8::bigint,
  location_postal = $9,
  silhouette_id = NULLIF($10, '')::bigint,
  fabric_id = NULLIF($11, '')::bigint,
  size_id = NULLIF($12, '')::bigint,
  neckline_id = NULLIF($13, '')::bigint,
  sleeve_style_id = NULLIF($14, '')::bigint,
  length_id = NULLIF($15, '')::bigint,
  color = $16,
  bust_inches = $17,
  waist_inches = $18,
  hips_inches = $19,
  original_retail_cents = $20,
  alterations_text = $21,
  has_original_receipt = $22,
  offers_enabled = $23,
  region_id = NULLIF($24, '')::bigint,
  is_authentic_declared = $25,
  includes_label_lining_photos = $26
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

export async function toggleListingSold(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await canEditListing(listingId, user))) {
    redirect("/listings");
  }

  await query(
    `UPDATE listings
        SET sold_at = CASE
          WHEN sold_at IS NULL THEN NOW()
          ELSE NULL
        END
      WHERE id = $1::bigint
        AND (seller_id = $2::bigint OR $3::boolean)`,
    [listingId, user.id, user.isAdmin],
  );

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
  revalidatePath(`/listings/mine`);

  const next = String(formData.get("next") ?? `/listings/${listingId}`);
  redirect(next);
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
  revalidatePath(`/`);
  revalidatePath(`/listings/mine`);
  redirect(`/listings/${listingId}/edit?vis=1`);
}

/**
 * One-click visibility toggle for the listing detail page. Flips
 * is_published in-SQL so the button works the same way for the seller
 * and admins. When `next` is supplied in the form, redirect there;
 * otherwise return to the detail page so the seller sees the
 * hidden-banner update.
 */
export async function toggleListingVisibility(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await canEditListing(listingId, user))) {
    redirect("/listings");
  }

  await query(
    `UPDATE listings
        SET is_published = NOT is_published
      WHERE id = $1::bigint
        AND (seller_id = $2::bigint OR $3::boolean)`,
    [listingId, user.id, user.isAdmin],
  );

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
  revalidatePath(`/listings/mine`);

  const next = String(formData.get("next") ?? `/listings/${listingId}`);
  redirect(next);
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
        AND (seller_id = $27::bigint OR $28::boolean)`,
    [
      listingId,
      f.description,
      f.price_cents,
      f.designer_id,
      f.model,
      f.year,
      f.condition_id,
      f.occasion_id,
      f.location_postal,
      f.silhouette_id ?? "",
      f.fabric_id ?? "",
      f.size_id ?? "",
      f.neckline_id ?? "",
      f.sleeve_style_id ?? "",
      f.length_id ?? "",
      f.color,
      f.bust_inches,
      f.waist_inches,
      f.hips_inches,
      f.original_retail_cents,
      f.alterations_text,
      f.has_original_receipt,
      f.offers_enabled,
      regionId,
      f.is_authentic_declared,
      f.includes_label_lining_photos,
      user.id,
      user.isAdmin,
    ],
  );

  await query(
    `UPDATE listings
        SET title = TRIM(BOTH FROM CONCAT_WS(' ',
              (SELECT name FROM designers WHERE id = listings.designer_id),
              model
            ))
      WHERE id = $1::bigint`,
    [listingId],
  );

  // Recompute trust_status. Edits can move the listing up or down the
  // ladder (e.g. seller untickeds the authenticity box, or adds the
  // missing measurements that push score over the verified threshold).
  const trustRow = await query<{
    trust_status: string;
    image_count: string;
  }>(
    `SELECT trust_status,
            (SELECT COUNT(*)::text FROM listing_images WHERE listing_id = listings.id) AS image_count
       FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const currentTrust =
    trustRow.rows[0]?.trust_status &&
    isTrustStatus(trustRow.rows[0].trust_status)
      ? trustRow.rows[0].trust_status
      : "self-declared";
  const settings = await loadSiteSettings();
  const nextTrust = deriveTrustStatus({
    current: currentTrust,
    threshold: settings.healthThresholdVerified,
    health: {
      designerId: f.designer_id,
      model: f.model,
      year: f.year,
      occasionId: f.occasion_id,
      conditionId: f.condition_id,
      sizeId: f.size_id,
      silhouetteId: f.silhouette_id,
      fabricId: f.fabric_id,
      necklineId: f.neckline_id,
      sleeveStyleId: f.sleeve_style_id,
      lengthId: f.length_id,
      color: f.color,
      bustInches: f.bust_inches,
      waistInches: f.waist_inches,
      hipsInches: f.hips_inches,
      originalRetailCents: f.original_retail_cents,
      hasOriginalReceipt: f.has_original_receipt,
      isAuthenticDeclared: f.is_authentic_declared,
      includesLabelLiningPhotos: f.includes_label_lining_photos,
      description: f.description,
      imageCount: Number(trustRow.rows[0]?.image_count ?? 0),
    },
  });
  if (nextTrust !== currentTrust) {
    await query(
      `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
      [nextTrust, listingId],
    );
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
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
  // Adding photos can push imageCount over 3, which is one of the
  // verified-badge criteria; re-derive so the badge appears immediately.
  await recomputeListingTrustStatus(listingId);

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
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
  revalidatePath(`/`);
  redirect(`/listings/${listingId}/edit`);
}

export async function moveListingImage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!/^\d+$/.test(imageId)) redirect("/listings");
  if (!["up", "down"].includes(direction)) redirect("/listings");
  if (!(await canEditListing(listingId, user))) redirect("/listings");

  await withTransaction(async (client) => {
    const cur = await client.query<{ position: number }>(
      `SELECT position FROM listing_images
        WHERE id = $1::bigint AND listing_id = $2::bigint LIMIT 1`,
      [imageId, listingId],
    );
    if (cur.rows.length === 0) return;
    const currentPos = cur.rows[0].position;

    const adj = await client.query<{ id: string; position: number }>(
      direction === "up"
        ? `SELECT id::text, position FROM listing_images
            WHERE listing_id = $1::bigint AND position < $2
            ORDER BY position DESC LIMIT 1`
        : `SELECT id::text, position FROM listing_images
            WHERE listing_id = $1::bigint AND position > $2
            ORDER BY position ASC LIMIT 1`,
      [listingId, currentPos],
    );
    if (adj.rows.length === 0) return;

    const otherId = adj.rows[0].id;
    const otherPos = adj.rows[0].position;

    await client.query(
      `UPDATE listing_images SET position = $1 WHERE id = $2::bigint`,
      [otherPos, imageId],
    );
    await client.query(
      `UPDATE listing_images SET position = $1 WHERE id = $2::bigint`,
      [currentPos, otherId],
    );
  });

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
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

  // Removing a photo can drop imageCount below 3, demoting trust.
  await recomputeListingTrustStatus(listingId);

  revalidatePath(`/listings/${listingId}`);
  revalidatePath(`/listings/${listingId}/edit`);
  revalidatePath(`/listings`);
  revalidatePath(`/`);
  redirect(`/listings/${listingId}/edit`);
}

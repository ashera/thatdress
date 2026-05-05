"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { deriveTrustStatus, isTrustStatus } from "@/lib/listing-trust";
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

export async function deleteDraftImage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (!/^\d+$/.test(imageId)) redirect("/listings/mine");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

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

  revalidatePath(`/listings/new/${listingId}/photos`);
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

  const designer_id = getRequiredId(formData, "designer_id");
  if (!designer_id) redirect(`${stepUrl}?error=invalid-designer`);

  const model = getString(formData, "model", 100);
  if (!model) redirect(`${stepUrl}?error=invalid-model`);

  const yearRaw = getString(formData, "year");
  let year: number | null = null;
  if (yearRaw) {
    const y = Number.parseInt(yearRaw, 10);
    if (!Number.isFinite(y) || y < MIN_YEAR || y > MAX_YEAR) {
      redirect(`${stepUrl}?error=invalid-year`);
    }
    year = y;
  }

  const files = collectImageFiles(formData);
  const imageErr = validateImages(files);
  if (imageErr) redirect(`${stepUrl}?error=${imageErr}`);

  // Set the basics first, then derive the title from the row's own
  // (now-current) columns so the designer-name lookup doesn't have to share
  // a parameter slot with designer_id/model in two type contexts.
  await query(
    `UPDATE listings
        SET designer_id = $2::bigint,
            model = $3,
            year = $4::int
      WHERE id = $1::bigint`,
    [listingId, designer_id, model, year],
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

  if (files.length > 0) {
    try {
      await appendImages(listingId, files);
    } catch {
      redirect(`${stepUrl}?error=upload-failed`);
    }
  }

  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/style`);
}

export async function saveDraftStyle(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/style`;

  const occasion_id = getRequiredId(formData, "occasion_id");
  if (!occasion_id) redirect(`${stepUrl}?error=invalid-occasion`);

  await query(
    `UPDATE listings
        SET occasion_id     = $2::bigint,
            silhouette_id   = NULLIF($3, '')::bigint,
            fabric_id       = NULLIF($4, '')::bigint,
            neckline_id     = NULLIF($5, '')::bigint,
            sleeve_style_id = NULLIF($6, '')::bigint,
            length_id       = NULLIF($7, '')::bigint,
            color           = $8
      WHERE id = $1::bigint`,
    [
      listingId,
      occasion_id,
      getOptionalId(formData, "silhouette_id") ?? "",
      getOptionalId(formData, "fabric_id") ?? "",
      getOptionalId(formData, "neckline_id") ?? "",
      getOptionalId(formData, "sleeve_style_id") ?? "",
      getOptionalId(formData, "length_id") ?? "",
      nullableString(getString(formData, "color", 32)),
    ],
  );

  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/measurements`);
}

export async function saveDraftMeasurements(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureDraftOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/measurements`;

  const measureRanges: Record<string, [number, number]> = {
    bust_inches: [20, 70],
    waist_inches: [18, 70],
    hips_inches: [24, 80],
  };
  const measures: Record<string, number | null> = {};
  for (const [k, [min, max]] of Object.entries(measureRanges)) {
    const v = getOptionalNumberInRange(formData, k, min, max);
    if (v === "out-of-range") redirect(`${stepUrl}?error=out-of-range`);
    measures[k] = v;
  }

  const retailRaw = getString(formData, "original_retail");
  let original_retail_cents: number | null = null;
  if (retailRaw) {
    const cents = parsePriceToCents(retailRaw);
    if (cents === null) redirect(`${stepUrl}?error=out-of-range`);
    original_retail_cents = cents;
  }

  await query(
    `UPDATE listings
        SET size_id              = NULLIF($2, '')::bigint,
            bust_inches          = $3,
            waist_inches         = $4,
            hips_inches          = $5,
            original_retail_cents = $6
      WHERE id = $1::bigint`,
    [
      listingId,
      getOptionalId(formData, "size_id") ?? "",
      measures.bust_inches,
      measures.waist_inches,
      measures.hips_inches,
      original_retail_cents,
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
        SET condition_id         = $2::bigint,
            has_original_receipt = $3,
            alterations_text     = $4
      WHERE id = $1::bigint`,
    [
      listingId,
      condition_id,
      getCheckbox(formData, "has_original_receipt"),
      nullableString(getString(formData, "alterations_text", ALTERATIONS_MAX)),
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

  const isAuthenticDeclared = getCheckbox(formData, "is_authentic_declared");
  if (!isAuthenticDeclared) {
    redirect(`${stepUrl}?error=authenticity-required`);
  }
  const includesLabelLiningPhotos = getCheckbox(
    formData,
    "includes_label_lining_photos",
  );

  // Final readiness check: everything required must be present on the
  // row, plus the snapshot we'll need to compute trust_status.
  const r = await query<{
    title: string | null;
    designer_id: string | null;
    model: string | null;
    year: number | null;
    occasion_id: string | null;
    condition_id: string | null;
    size_id: string | null;
    silhouette_id: string | null;
    fabric_id: string | null;
    neckline_id: string | null;
    sleeve_style_id: string | null;
    length_id: string | null;
    color: string | null;
    bust_inches: string | null;
    waist_inches: string | null;
    hips_inches: string | null;
    original_retail_cents: number | null;
    has_original_receipt: boolean | null;
    trust_status: string | null;
    image_count: string;
  }>(
    `SELECT title,
            designer_id::text,
            model,
            year,
            occasion_id::text,
            condition_id::text,
            size_id::text,
            silhouette_id::text,
            fabric_id::text,
            neckline_id::text,
            sleeve_style_id::text,
            length_id::text,
            color,
            bust_inches::text,
            waist_inches::text,
            hips_inches::text,
            original_retail_cents,
            has_original_receipt,
            trust_status,
            (SELECT COUNT(*)::text FROM listing_images WHERE listing_id = listings.id) AS image_count
       FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) redirect("/listings/mine");
  if (!row.title || !row.designer_id || !row.model) {
    redirect(`/listings/new/${listingId}/photos?error=incomplete`);
  }
  if (!row.occasion_id) {
    redirect(`/listings/new/${listingId}/style?error=incomplete`);
  }
  if (!row.condition_id) {
    redirect(`/listings/new/${listingId}/condition?error=incomplete`);
  }

  // Compute trust_status from the snapshot above + the just-submitted
  // declaration checkboxes + the description being saved on this turn.
  function num(s: string | null): number | null {
    if (s == null || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const currentTrust =
    row.trust_status && isTrustStatus(row.trust_status)
      ? row.trust_status
      : "self-declared";
  const settings = await loadSiteSettings();
  const nextTrust = deriveTrustStatus({
    current: currentTrust,
    threshold: settings.healthThresholdVerified,
    health: {
      designerId: row.designer_id,
      model: row.model,
      year: row.year,
      occasionId: row.occasion_id,
      conditionId: row.condition_id,
      sizeId: row.size_id,
      silhouetteId: row.silhouette_id,
      fabricId: row.fabric_id,
      necklineId: row.neckline_id,
      sleeveStyleId: row.sleeve_style_id,
      lengthId: row.length_id,
      color: row.color,
      bustInches: num(row.bust_inches),
      waistInches: num(row.waist_inches),
      hipsInches: num(row.hips_inches),
      originalRetailCents: row.original_retail_cents,
      hasOriginalReceipt: !!row.has_original_receipt,
      isAuthenticDeclared,
      includesLabelLiningPhotos,
      description,
      imageCount: Number(row.image_count ?? 0),
    },
  });

  await query(
    `UPDATE listings
        SET description = $2,
            price_cents = $3,
            location_postal = $4,
            region_id = NULLIF($5, '')::bigint,
            offers_enabled = $6,
            is_authentic_declared = $7,
            includes_label_lining_photos = $8,
            trust_status = $9,
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
      isAuthenticDeclared,
      includesLabelLiningPhotos,
      nextTrust,
    ],
  );

  revalidatePath("/listings");
  revalidatePath("/listings/mine");
  revalidatePath("/");
  redirect(`/listings/${listingId}`);
}

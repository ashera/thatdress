"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
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

async function ensureWizardOwnership(
  listingId: string,
  user: { id: string; isAdmin: boolean },
): Promise<boolean> {
  if (!/^\d+$/.test(listingId)) return false;
  const r = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings
      WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) return false;
  // The wizard now serves both new (is_draft=TRUE) and edit (is_draft=FALSE)
  // flows; ownership is the only gate.
  return user.isAdmin || row.seller_id === user.id;
}

/** Look up an existing designer by case-insensitive name, or create
 *  a new one flagged is_user_submitted. The TRIM/LOWER comparison
 *  prevents trivial duplicates ('Vera Wang' / 'vera wang' /
 *  '  VERA WANG  ' all collapse to the same row).
 *
 *  Returns the designer id as a string. */
async function resolveOrCreateDesigner(
  rawName: string,
  userId: string,
): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;

  const existing = await query<{ id: string }>(
    `SELECT id::text FROM designers
      WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1`,
    [name],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  try {
    const inserted = await query<{ id: string }>(
      `INSERT INTO designers (name, is_active, is_user_submitted, created_by_user_id)
         VALUES ($1, TRUE, TRUE, $2::bigint)
         RETURNING id::text`,
      [name, userId],
    );
    return inserted.rows[0]?.id ?? null;
  } catch (err) {
    // 23505 is unique_violation — race with another seller adding the
    // same name at the same moment. Re-read.
    if ((err as { code?: string }).code === "23505") {
      const retry = await query<{ id: string }>(
        `SELECT id::text FROM designers
          WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1`,
        [name],
      );
      return retry.rows[0]?.id ?? null;
    }
    throw err;
  }
}

/** Whether a listing is in the draft pre-publish state. */
async function isListingDraft(listingId: string): Promise<boolean> {
  const r = await query<{ is_draft: boolean }>(
    `SELECT is_draft FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  return r.rows[0]?.is_draft === true;
}

export async function startDraftListing(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const regionId = await getCurrentRegionId();

  // Phase 1 of the dress-as-first-class refactor: every listing now
  // points at a `dresses` row carrying the physical attrs. The new
  // dress is created by the original lister and starts in their
  // ownership with disposition='available'. When the listing sells
  // the buyer becomes the current_owner_user_id (Phase 2 wires that).
  const dRes = await query<{ id: string }>(
    `INSERT INTO dresses (created_by_user_id, current_owner_user_id, disposition)
     VALUES ($1::bigint, $1::bigint, 'available')
     RETURNING id::text`,
    [user.id],
  );
  const dressId = dRes.rows[0]!.id;

  const lRes = await query<{ id: string }>(
    `INSERT INTO listings
       (dress_id, title, price_cents, seller_id, is_draft, is_published, region_id)
     VALUES ($1::bigint, '', 0, $2::bigint, TRUE, FALSE, $3)
     RETURNING id::text`,
    [dressId, user.id, regionId],
  );
  const listingId = lRes.rows[0]!.id;
  redirect(`/listings/new/${listingId}/basics`);
}

export async function deleteDraftImage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  if (!/^\d+$/.test(imageId)) redirect("/listings/mine");
  if (!(await ensureWizardOwnership(listingId, user))) {
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

  // Photo deletion can drop imageCount below the 3-photo verified
  // threshold AND can flip includes_label_lining_photos from true to
  // false (if the deleted image was a label or lining slot). Refresh
  // both before redirecting.
  await refreshLabelLiningFlag(listingId);
  await recomputeListingTrustStatus(listingId);

  revalidatePath(`/listings/new/${listingId}/photos`);
  redirect(`/listings/new/${listingId}/photos`);
}

export async function abandonDraftListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
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

export async function saveDraftBasics(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/basics`;

  // Designer can come either as an existing id from the dropdown, or
  // as a free-text name when the seller's brand isn't in the curated
  // list. Treat the typed name as the source of truth when present —
  // case-insensitive match against existing rows so we don't churn
  // duplicates like 'Vera Wang' / 'vera wang' / 'VERA WANG'; insert a
  // new row flagged is_user_submitted otherwise.
  const designerSelection = String(formData.get("designer_id") ?? "");
  const newDesignerName = getString(formData, "designer_name_new", 80);

  let designer_id: string | null = null;
  if (designerSelection === "new" || (newDesignerName && !/^\d+$/.test(designerSelection))) {
    if (!newDesignerName) {
      redirect(`${stepUrl}?error=designer-name-required`);
    }
    designer_id = await resolveOrCreateDesigner(newDesignerName, user.id);
  } else {
    designer_id = /^\d+$/.test(designerSelection) ? designerSelection : null;
  }
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

  // Designer / model / year are physical attrs — they live on the
  // dress, not the listing. Update via the dress_id link.
  await query(
    `UPDATE dresses
        SET designer_id = $2::bigint,
            model = $3,
            year = $4::int
      WHERE id = (SELECT dress_id FROM listings WHERE id = $1::bigint)`,
    [listingId, designer_id, model, year],
  );
  // Title still lives on the listing (per-sale string), but its
  // value is derived from the dress's designer + model.
  await query(
    `UPDATE listings
        SET title = TRIM(BOTH FROM CONCAT_WS(' ',
              (SELECT de.name FROM dresses dr
                  JOIN designers de ON de.id = dr.designer_id
                  WHERE dr.id = listings.dress_id),
              (SELECT model FROM dresses WHERE id = listings.dress_id)
            ))
      WHERE id = $1::bigint`,
    [listingId],
  );

  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/photos`);
}

/** Recompute listings.includes_label_lining_photos from the current
 *  set of role-tagged photos. The flag becomes true iff both a 'label'
 *  and 'lining' photo are attached to the listing. Auto-derived now
 *  that the wizard captures these as named slots — no separate
 *  declaration checkbox needed. */
async function refreshLabelLiningFlag(listingId: string): Promise<void> {
  await query(
    `UPDATE listings
        SET includes_label_lining_photos = (
          SELECT COUNT(*) FILTER (WHERE role = 'label') > 0
             AND COUNT(*) FILTER (WHERE role = 'lining') > 0
            FROM listing_images
            WHERE listing_id = $1::bigint
        )
      WHERE id = $1::bigint`,
    [listingId],
  );
}

const SLOT_ROLES = new Set(["front", "back", "label", "lining"]);

/** Upload (or replace) the photo attached to a single verification
 *  slot. Each call: validates the role, validates the file, deletes
 *  any existing image for that role, inserts the new image with the
 *  role tag, then re-derives the label/lining flag and trust status.
 *
 *  When role='front', the image is also marked is_primary so the
 *  listing card and detail-page hero use it. is_primary is cleared
 *  on every other image in the listing first so we don't violate the
 *  one-primary unique index. */
export async function uploadDraftSlotPhoto(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/photos`;

  const role = String(formData.get("role") ?? "");
  if (!SLOT_ROLES.has(role)) redirect(`${stepUrl}?error=invalid-role`);

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${stepUrl}?error=invalid-image`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    redirect(`${stepUrl}?error=too-large`);
  }
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    redirect(`${stepUrl}?error=bad-type`);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  await query(
    `DELETE FROM listing_images
       WHERE listing_id = $1::bigint AND role = $2`,
    [listingId, role],
  );

  // 'front' becomes the primary image. Clear other primaries first so
  // we don't fight the listing_images_one_primary_idx unique constraint.
  if (role === "front") {
    await query(
      `UPDATE listing_images SET is_primary = FALSE
        WHERE listing_id = $1::bigint`,
      [listingId],
    );
  }

  // Position deterministic by role so the gallery has a sensible order
  // even with no manual reordering.
  const positionByRole: Record<string, number> = {
    front: 0,
    back: 1,
    label: 2,
    lining: 3,
  };
  const isPrimary = role === "front";

  try {
    await query(
      `INSERT INTO listing_images
        (listing_id, mime_type, bytes, byte_size, position, is_primary, role)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, $7)`,
      [
        listingId,
        file.type,
        buf,
        file.size,
        positionByRole[role] ?? 0,
        isPrimary,
        role,
      ],
    );
  } catch {
    redirect(`${stepUrl}?error=upload-failed`);
  }

  await refreshLabelLiningFlag(listingId);
  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(stepUrl);
}

/** Upload extra (un-roled) photos to the listing — anything beyond the
 *  four verification slots. Photos are appended at the end of the
 *  gallery with role NULL, position after the existing maximum, and
 *  is_primary only if no primary exists yet. */
export async function uploadDraftExtraPhotos(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/photos`;

  const files = collectImageFiles(formData);
  const imageErr = validateImages(files);
  if (imageErr) redirect(`${stepUrl}?error=${imageErr}`);
  if (files.length === 0) redirect(stepUrl);

  try {
    await appendImages(listingId, files);
  } catch {
    redirect(`${stepUrl}?error=upload-failed`);
  }

  await refreshLabelLiningFlag(listingId);
  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(stepUrl);
}

export async function saveDraftPhotos(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  // Slot uploads happen via uploadDraftSlotPhoto on each slot's own
  // form. This 'continue' submission has nothing to save — but we
  // still re-derive the label/lining flag and trust as a defensive
  // refresh in case the row drifted (legacy data, manual SQL, etc.).
  await refreshLabelLiningFlag(listingId);
  await recomputeListingTrustStatus(listingId);
  redirect(`/listings/new/${listingId}/style`);
}

export async function saveDraftStyle(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
    redirect("/listings/mine");
  }

  const stepUrl = `/listings/new/${listingId}/style`;

  const occasion_id = getRequiredId(formData, "occasion_id");
  if (!occasion_id) redirect(`${stepUrl}?error=invalid-occasion`);

  // occasion_id is a per-sale marketing choice — stays on listings.
  await query(
    `UPDATE listings
        SET occasion_id = $2::bigint
      WHERE id = $1::bigint`,
    [listingId, occasion_id],
  );

  // Silhouette / fabric / neckline / sleeve / length / color are
  // physical attrs — write to dresses via the dress_id link.
  await query(
    `UPDATE dresses
        SET silhouette_id   = NULLIF($2, '')::bigint,
            fabric_id       = NULLIF($3, '')::bigint,
            neckline_id     = NULLIF($4, '')::bigint,
            sleeve_style_id = NULLIF($5, '')::bigint,
            length_id       = NULLIF($6, '')::bigint,
            color           = $7
      WHERE id = (SELECT dress_id FROM listings WHERE id = $1::bigint)`,
    [
      listingId,
      getOptionalId(formData, "silhouette_id") ?? "",
      getOptionalId(formData, "fabric_id") ?? "",
      getOptionalId(formData, "neckline_id") ?? "",
      getOptionalId(formData, "sleeve_style_id") ?? "",
      getOptionalId(formData, "length_id") ?? "",
      nullableString(getString(formData, "color", 32)),
    ],
  );

  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/measurements`);
}

export async function saveDraftMeasurements(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
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

  // Size + body measurements + original retail price are physical
  // attrs — write to dresses via dress_id.
  await query(
    `UPDATE dresses
        SET size_id              = NULLIF($2, '')::bigint,
            bust_inches          = $3,
            waist_inches         = $4,
            hips_inches          = $5,
            original_retail_cents = $6
      WHERE id = (SELECT dress_id FROM listings WHERE id = $1::bigint)`,
    [
      listingId,
      getOptionalId(formData, "size_id") ?? "",
      measures.bust_inches,
      measures.waist_inches,
      measures.hips_inches,
      original_retail_cents,
    ],
  );

  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/condition`);
}

export async function saveDraftCondition(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
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

  await recomputeListingTrustStatus(listingId);
  revalidatePath(stepUrl);
  redirect(`/listings/new/${listingId}/publish`);
}

export async function publishDraftListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureWizardOwnership(listingId, user))) {
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
    includes_label_lining_photos: boolean | null;
    trust_status: string | null;
    is_draft: boolean;
    is_published: boolean;
    image_count: string;
  }>(
    `SELECT l.title,
            dr.designer_id::text       AS designer_id,
            dr.model                   AS model,
            dr.year                    AS year,
            l.occasion_id::text       AS occasion_id,
            l.condition_id::text      AS condition_id,
            dr.size_id::text           AS size_id,
            dr.silhouette_id::text     AS silhouette_id,
            dr.fabric_id::text         AS fabric_id,
            dr.neckline_id::text       AS neckline_id,
            dr.sleeve_style_id::text   AS sleeve_style_id,
            dr.length_id::text         AS length_id,
            dr.color                   AS color,
            dr.bust_inches::text       AS bust_inches,
            dr.waist_inches::text      AS waist_inches,
            dr.hips_inches::text       AS hips_inches,
            dr.original_retail_cents   AS original_retail_cents,
            l.has_original_receipt    AS has_original_receipt,
            l.includes_label_lining_photos AS includes_label_lining_photos,
            l.trust_status            AS trust_status,
            l.is_draft                AS is_draft,
            l.is_published            AS is_published,
            (SELECT COUNT(*)::text FROM listing_images WHERE listing_id = l.id) AS image_count
       FROM listings l
       JOIN dresses dr ON dr.id = l.dress_id
       WHERE l.id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) redirect("/listings/mine");
  if (!row.title || !row.designer_id || !row.model) {
    redirect(`/listings/new/${listingId}/basics?error=incomplete`);
  }
  // Read the label/lining declaration from the row — set on the photos
  // step and not collected on this form anymore.
  const includesLabelLiningPhotos = !!row.includes_label_lining_photos;
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

  // Two modes:
  //  - draft → publish: toggle is_draft FALSE + is_published TRUE
  //  - already-published edit: leave is_draft / is_published alone so
  //    a previously hidden listing stays hidden after a save.
  const isPublishingDraft = row.is_draft;
  const draftToggleSql = isPublishingDraft
    ? ", is_draft = FALSE, is_published = TRUE"
    : "";
  await query(
    `UPDATE listings
        SET description = $2,
            price_cents = $3,
            location_postal = $4,
            region_id = NULLIF($5, '')::bigint,
            offers_enabled = $6,
            is_authentic_declared = $7,
            trust_status = $8${draftToggleSql}
      WHERE id = $1::bigint`,
    [
      listingId,
      nullableString(description),
      priceCents,
      location_postal,
      regionId ?? "",
      getCheckbox(formData, "offers_enabled"),
      isAuthenticDeclared,
      nextTrust,
    ],
  );

  revalidatePath("/listings");
  revalidatePath("/listings/mine");
  revalidatePath("/");
  redirect(`/listings/${listingId}`);
}

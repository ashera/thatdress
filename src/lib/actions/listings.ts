"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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

function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  if (dollars > PRICE_MAX_DOLLARS) return null;
  return Math.round(dollars * 100);
}

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

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "");
  const files = collectImageFiles(formData);

  if (!title || title.length > TITLE_MAX) {
    redirect("/listings/new?error=invalid-title");
  }
  if (description.length > DESCRIPTION_MAX) {
    redirect("/listings/new?error=long-description");
  }

  const priceCents = parsePriceToCents(priceRaw);
  if (priceCents === null) {
    redirect("/listings/new?error=invalid-price");
  }

  const imageErr = validateImages(files);
  if (imageErr) redirect(`/listings/new?error=${imageErr}`);

  const inserted = await query<{ id: string }>(
    `INSERT INTO listings (title, description, price_cents, seller_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text`,
    [title, description || null, priceCents, user.id],
  );
  const listingId = inserted.rows[0]!.id;

  try {
    await insertImages(listingId, files, 0, false);
  } catch {
    // Listing was created; surface this as a generic upload error
    revalidatePath("/listings");
    redirect(`/listings/${listingId}/edit?error=upload-failed`);
  }

  revalidatePath("/listings");
  redirect(`/listings/${listingId}`);
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

export async function addListingImages(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!(await ensureListingOwner(listingId, user.id))) {
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
  if (!(await ensureListingOwner(listingId, user.id))) redirect("/listings");

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
  if (!(await ensureListingOwner(listingId, user.id))) redirect("/listings");

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

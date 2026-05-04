"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { slugify } from "@/lib/blog";

const TITLE_MAX = 200;
const EXCERPT_MAX = 320;
const SLUG_MAX = 80;
const BODY_MAX = 100_000;

const MAX_HERO_BYTES = 5 * 1024 * 1024;
const ALLOWED_HERO_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getString(formData: FormData, key: string, max?: number): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (max && raw.length > max) return raw.slice(0, max);
  return raw;
}

function nullableString(s: string): string | null {
  return s.length === 0 ? null : s;
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= SLUG_MAX;
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let candidate = base.length > 0 ? base : "post";
  let n = 1;
  // Try base, then base-2, base-3, ... until we find a free one.
  // Sanely bounded — if we somehow pass 200, just append the timestamp.
  while (n < 200) {
    const r = await query<{ id: string }>(
      `SELECT id::text FROM blog_posts WHERE slug = $1 LIMIT 1`,
      [candidate],
    );
    const row = r.rows[0];
    if (!row || row.id === ignoreId) return candidate;
    n += 1;
    candidate = `${base}-${n}`.slice(0, SLUG_MAX);
  }
  return `${base}-${Date.now()}`.slice(0, SLUG_MAX);
}

export async function createBlogPost(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const title = getString(formData, "title", TITLE_MAX);
  if (!title) redirect("/admin/blog/new?error=invalid-title");

  const customSlug = getString(formData, "slug", SLUG_MAX);
  const baseSlug = customSlug ? customSlug : slugify(title);
  if (customSlug && !isValidSlug(customSlug)) {
    redirect("/admin/blog/new?error=invalid-slug");
  }
  const slug = await uniqueSlug(baseSlug);

  const excerpt = getString(formData, "excerpt", EXCERPT_MAX);
  const bodyMd = getString(formData, "body_md", BODY_MAX);

  const r = await query<{ id: string }>(
    `INSERT INTO blog_posts (slug, title, excerpt, body_md, author_id)
     VALUES ($1, $2, $3, $4, $5::bigint)
     RETURNING id::text`,
    [slug, title, nullableString(excerpt), bodyMd, me.id],
  );
  const id = r.rows[0]!.id;

  await maybeUploadHero(formData, id);

  revalidatePath("/blog");
  revalidatePath("/admin/blog");
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

export async function updateBlogPost(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  const title = getString(formData, "title", TITLE_MAX);
  if (!title) redirect(`/admin/blog/${id}/edit?error=invalid-title`);

  const customSlug = getString(formData, "slug", SLUG_MAX);
  const baseSlug = customSlug ? customSlug : slugify(title);
  if (customSlug && !isValidSlug(customSlug)) {
    redirect(`/admin/blog/${id}/edit?error=invalid-slug`);
  }
  const slug = await uniqueSlug(baseSlug, id);

  const excerpt = getString(formData, "excerpt", EXCERPT_MAX);
  const bodyMd = getString(formData, "body_md", BODY_MAX);

  await query(
    `UPDATE blog_posts
        SET slug = $2,
            title = $3,
            excerpt = $4,
            body_md = $5,
            updated_at = NOW()
      WHERE id = $1::bigint`,
    [id, slug, title, nullableString(excerpt), bodyMd],
  );

  await maybeUploadHero(formData, id);

  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}/edit`);
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

export async function deleteBlogPost(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  await query(`DELETE FROM blog_posts WHERE id = $1::bigint`, [id]);

  revalidatePath("/blog");
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function setBlogPublishedAt(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  const raw = String(formData.get("published_at") ?? "").trim();
  // datetime-local supplies "YYYY-MM-DDTHH:mm" in the user's local zone.
  // Empty input means "unschedule" (back to draft).
  let publishedAt: Date | null = null;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
    else redirect(`/admin/blog/${id}/edit?error=invalid-date`);
  }

  await query(
    `UPDATE blog_posts
        SET published_at = $2,
            updated_at = NOW()
      WHERE id = $1::bigint`,
    [id, publishedAt],
  );

  const r = await query<{ slug: string }>(
    `SELECT slug FROM blog_posts WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const slug = r.rows[0]?.slug;

  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}/edit`);
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

export async function toggleBlogPublished(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  await query(
    `UPDATE blog_posts
        SET published_at = CASE
              WHEN published_at IS NULL THEN NOW()
              ELSE NULL
            END,
            updated_at = NOW()
      WHERE id = $1::bigint`,
    [id],
  );

  const r = await query<{ slug: string }>(
    `SELECT slug FROM blog_posts WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const slug = r.rows[0]?.slug;

  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${id}/edit`);
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

async function maybeUploadHero(
  formData: FormData,
  postId: string,
): Promise<void> {
  const file = formData.get("hero");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_HERO_BYTES) return; // silently skip oversize
  if (!ALLOWED_HERO_MIMES.has(file.type)) return;

  const buf = Buffer.from(await file.arrayBuffer());

  await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO blog_images (post_id, mime_type, bytes, byte_size)
       VALUES ($1::bigint, $2, $3, $4)
       RETURNING id::text`,
      [postId, file.type, buf, file.size],
    );
    const newImageId = ins.rows[0]!.id;
    await client.query(
      `UPDATE blog_posts SET hero_image_id = $1::bigint, updated_at = NOW()
        WHERE id = $2::bigint`,
      [newImageId, postId],
    );
  });
}

function getTagIds(formData: FormData): string[] {
  return formData
    .getAll("tag_ids")
    .map((v) => String(v).trim())
    .filter((s) => /^\d+$/.test(s));
}

async function syncPostTags(
  postId: string,
  tagIds: string[],
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM blog_post_tags WHERE post_id = $1::bigint`,
      [postId],
    );
    if (tagIds.length === 0) return;
    const placeholders = tagIds.map((_, i) => `($1::bigint, $${i + 2}::bigint)`);
    await client.query(
      `INSERT INTO blog_post_tags (post_id, tag_id)
       VALUES ${placeholders.join(", ")}`,
      [postId, ...tagIds],
    );
  });
}

export async function setBlogPostTags(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  await syncPostTags(id, getTagIds(formData));

  const r = await query<{ slug: string }>(
    `SELECT slug FROM blog_posts WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const slug = r.rows[0]?.slug;

  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath(`/admin/blog/${id}/edit`);
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

export async function createBlogTag(formData: FormData): Promise<void> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect("/admin/blog/tags?error=invalid-label");
  const slug = slugify(label) || `tag-${Date.now()}`;

  await query(
    `INSERT INTO blog_tags (slug, label) VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING`,
    [slug, label],
  );

  revalidatePath("/admin/blog/tags");
  revalidatePath("/blog");
  redirect("/admin/blog/tags?saved=1");
}

export async function deleteBlogTag(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("tagId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/tags");

  await query(`DELETE FROM blog_tags WHERE id = $1::bigint`, [id]);

  revalidatePath("/admin/blog/tags");
  revalidatePath("/blog");
  revalidatePath("/blog/tag/[slug]", "page");
  redirect("/admin/blog/tags?saved=1");
}

export async function clearBlogHero(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("postId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog");

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE blog_posts SET hero_image_id = NULL, updated_at = NOW()
        WHERE id = $1::bigint`,
      [id],
    );
    await client.query(
      `DELETE FROM blog_images WHERE post_id = $1::bigint`,
      [id],
    );
  });

  revalidatePath("/blog");
  revalidatePath(`/admin/blog/${id}/edit`);
  redirect(`/admin/blog/${id}/edit?saved=1`);
}

/**
 * Fire-and-forget view logger called from a tiny client component on the
 * public post page. Skips admin viewers so internal traffic doesn't pollute
 * the counter. Errors are swallowed — analytics shouldn't break rendering.
 */
export async function logBlogPostView(postId: string): Promise<void> {
  if (!/^\d+$/.test(postId)) return;
  try {
    const user = await getCurrentUser();
    if (user?.isAdmin) return;
    await query(
      `INSERT INTO blog_post_views (post_id, viewer_id)
       VALUES ($1::bigint, $2::bigint)`,
      [postId, user?.id ?? null],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[blog] logBlogPostView failed", err);
  }
}

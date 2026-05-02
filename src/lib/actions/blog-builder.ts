"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

const PHRASE_MAX = 200;
const NOTES_MAX = 2000;

const VALID_INTENTS = new Set([
  "informational",
  "commercial",
  "navigational",
  "transactional",
]);

const VALID_STATUSES = new Set([
  "idea",
  "clustered",
  "drafted",
  "published",
]);

function getString(formData: FormData, key: string, max?: number): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (max && raw.length > max) return raw.slice(0, max);
  return raw;
}

function nullableString(s: string): string | null {
  return s.length === 0 ? null : s;
}

function getOptionalInt(formData: FormData, key: string): number | null {
  const raw = getString(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function getIntentOrNull(formData: FormData, key: string): string | null {
  const v = getString(formData, key).toLowerCase();
  return VALID_INTENTS.has(v) ? v : null;
}

function getStatusOrIdea(formData: FormData, key: string): string {
  const v = getString(formData, key).toLowerCase();
  return VALID_STATUSES.has(v) ? v : "idea";
}

export async function createBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const phrase = getString(formData, "phrase", PHRASE_MAX);
  if (!phrase) redirect("/admin/blog/builder/new?error=invalid-phrase");

  const intent = getIntentOrNull(formData, "intent");
  const searchVolume = getOptionalInt(formData, "search_volume");
  const difficulty = getOptionalInt(formData, "difficulty");
  const notes = nullableString(getString(formData, "notes", NOTES_MAX));
  const status = getStatusOrIdea(formData, "status");

  try {
    await query(
      `INSERT INTO blog_keywords (phrase, intent, search_volume, difficulty, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phrase, intent, searchVolume, difficulty, notes, status],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      redirect("/admin/blog/builder/new?error=duplicate");
    }
    throw err;
  }

  revalidatePath("/admin/blog/builder");
  redirect("/admin/blog/builder?saved=1");
}

export async function bulkCreateBlogKeywords(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const intent = getIntentOrNull(formData, "intent");
  const status = getStatusOrIdea(formData, "status");
  const raw = String(formData.get("phrases") ?? "");
  const phrases = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= PHRASE_MAX);

  if (phrases.length === 0) {
    redirect("/admin/blog/builder/new?error=empty-bulk");
  }

  // One insert; phrase rows fan out via VALUES, intent + status are shared.
  // ON CONFLICT skips dupes against the lowercase-unique index on phrase.
  const placeholders = phrases.map((_, i) => `($${i + 3})`).join(", ");
  await query(
    `INSERT INTO blog_keywords (intent, status, phrase)
     SELECT $1, $2, p.phrase
       FROM (VALUES ${placeholders}) AS p(phrase)
       ON CONFLICT DO NOTHING`,
    [intent, status, ...phrases],
  );

  revalidatePath("/admin/blog/builder");
  redirect(
    `/admin/blog/builder?saved=1&added=${phrases.length}`,
  );
}

export async function updateBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");

  const phrase = getString(formData, "phrase", PHRASE_MAX);
  if (!phrase)
    redirect(`/admin/blog/builder/${id}?error=invalid-phrase`);

  const intent = getIntentOrNull(formData, "intent");
  const searchVolume = getOptionalInt(formData, "search_volume");
  const difficulty = getOptionalInt(formData, "difficulty");
  const notes = nullableString(getString(formData, "notes", NOTES_MAX));
  const status = getStatusOrIdea(formData, "status");

  try {
    await query(
      `UPDATE blog_keywords
          SET phrase = $2,
              intent = $3,
              search_volume = $4,
              difficulty = $5,
              notes = $6,
              status = $7,
              updated_at = NOW()
        WHERE id = $1::bigint`,
      [id, phrase, intent, searchVolume, difficulty, notes, status],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      redirect(`/admin/blog/builder/${id}?error=duplicate`);
    }
    throw err;
  }

  revalidatePath("/admin/blog/builder");
  redirect(`/admin/blog/builder/${id}?saved=1`);
}

export async function deleteBlogKeyword(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("keywordId") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/blog/builder");

  await query(`DELETE FROM blog_keywords WHERE id = $1::bigint`, [id]);

  revalidatePath("/admin/blog/builder");
  redirect("/admin/blog/builder?saved=1");
}

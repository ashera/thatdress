"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

const STATUS_VALUES = ["alive", "dead", "pending", "removed"] as const;
const LINK_TYPES = [
  "dofollow",
  "nofollow",
  "sponsored",
  "ugc",
  "unknown",
] as const;
const SOURCE_KINDS = [
  "editorial",
  "directory",
  "forum",
  "social",
  "blog-post",
  "press",
  "partner",
  "review",
  "other",
] as const;

type Status = (typeof STATUS_VALUES)[number];
type LinkType = (typeof LINK_TYPES)[number];
type SourceKind = (typeof SOURCE_KINDS)[number];

function isStatus(v: string): v is Status {
  return (STATUS_VALUES as readonly string[]).includes(v);
}
function isLinkType(v: string): v is LinkType {
  return (LINK_TYPES as readonly string[]).includes(v);
}
function isSourceKind(v: string): v is SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(v);
}

function getString(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function nullable(s: string): string | null {
  return s.length === 0 ? null : s;
}

/**
 * Extract hostname (without 'www.') from a URL. Used to derive
 * source_domain at write-time so we don't have to parse on every
 * read. Returns empty string when the URL doesn't parse — the
 * caller redirects with an error in that case.
 */
function deriveDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function pickStatus(raw: string): Status {
  return isStatus(raw) ? raw : "alive";
}
function pickLinkType(raw: string): LinkType {
  return isLinkType(raw) ? raw : "unknown";
}
function pickSourceKind(raw: string): SourceKind {
  return isSourceKind(raw) ? raw : "other";
}

/**
 * Create a new backlink row. Source URL is required, target URL
 * is required; everything else has sane defaults. source_domain
 * is derived from source_url at write-time so the admin doesn't
 * have to think about it.
 */
export async function createBacklink(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const source_url = getString(formData, "source_url", 2000);
  const target_url = getString(formData, "target_url", 2000);
  if (!source_url || !target_url) {
    redirect("/admin/links?error=missing-url");
  }
  const source_domain = deriveDomain(source_url);
  if (!source_domain) {
    redirect("/admin/links?error=bad-source-url");
  }
  if (!deriveDomain(target_url)) {
    redirect("/admin/links?error=bad-target-url");
  }

  const status = pickStatus(getString(formData, "status", 16));
  const link_type = pickLinkType(getString(formData, "link_type", 16));
  const source_kind = pickSourceKind(getString(formData, "source_kind", 16));
  const source_title = nullable(getString(formData, "source_title", 200));
  const anchor_text = nullable(getString(formData, "anchor_text", 200));
  const notes = nullable(getString(formData, "notes", 2000));
  // 'discovered_at' defaults to NOW() — admins can backfill via edit.
  const last_checked_at = status === "alive" ? new Date().toISOString() : null;

  await query(
    `INSERT INTO backlinks (
       source_url, source_domain, source_title,
       target_url, anchor_text,
       status, link_type, source_kind,
       last_checked_at, notes, created_by_user_id
     )
     VALUES (
       $1, $2, $3,
       $4, $5,
       $6, $7, $8,
       $9, $10, $11::bigint
     )`,
    [
      source_url,
      source_domain,
      source_title,
      target_url,
      anchor_text,
      status,
      link_type,
      source_kind,
      last_checked_at,
      notes,
      user.id,
    ],
  );

  revalidatePath("/admin/links");
  redirect("/admin/links?saved=created");
}

/**
 * Edit an existing backlink. Same field shape as create; the form
 * carries the id in a hidden input.
 */
export async function updateBacklink(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/links");

  const source_url = getString(formData, "source_url", 2000);
  const target_url = getString(formData, "target_url", 2000);
  if (!source_url || !target_url) {
    redirect(`/admin/links/${id}?error=missing-url`);
  }
  const source_domain = deriveDomain(source_url);
  if (!source_domain) {
    redirect(`/admin/links/${id}?error=bad-source-url`);
  }
  if (!deriveDomain(target_url)) {
    redirect(`/admin/links/${id}?error=bad-target-url`);
  }

  const status = pickStatus(getString(formData, "status", 16));
  const link_type = pickLinkType(getString(formData, "link_type", 16));
  const source_kind = pickSourceKind(getString(formData, "source_kind", 16));
  const source_title = nullable(getString(formData, "source_title", 200));
  const anchor_text = nullable(getString(formData, "anchor_text", 200));
  const notes = nullable(getString(formData, "notes", 2000));

  await query(
    `UPDATE backlinks
        SET source_url    = $1,
            source_domain = $2,
            source_title  = $3,
            target_url    = $4,
            anchor_text   = $5,
            status        = $6,
            link_type     = $7,
            source_kind   = $8,
            notes         = $9,
            updated_at    = NOW()
      WHERE id = $10::bigint`,
    [
      source_url,
      source_domain,
      source_title,
      target_url,
      anchor_text,
      status,
      link_type,
      source_kind,
      notes,
      id,
    ],
  );

  revalidatePath("/admin/links");
  revalidatePath(`/admin/links/${id}`);
  redirect(`/admin/links?saved=updated`);
}

/**
 * Quick one-button toggle from the list page. Doesn't open the
 * edit page — useful for batch status updates after a manual
 * sweep. Stamps last_checked_at = NOW().
 */
export async function setBacklinkStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("next_status") ?? "");
  if (!/^\d+$/.test(id) || !isStatus(next)) {
    redirect("/admin/links");
  }
  await query(
    `UPDATE backlinks
        SET status          = $2,
            last_checked_at = NOW(),
            updated_at      = NOW()
      WHERE id = $1::bigint`,
    [id, next],
  );
  revalidatePath("/admin/links");
  revalidatePath(`/admin/links/${id}`);
  redirect("/admin/links?saved=status");
}

export async function deleteBacklink(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/links");
  await query(`DELETE FROM backlinks WHERE id = $1::bigint`, [id]);
  revalidatePath("/admin/links");
  redirect("/admin/links?saved=deleted");
}

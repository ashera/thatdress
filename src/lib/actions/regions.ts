"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { REGION_COOKIE } from "@/lib/regions";

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function setRegion(formData: FormData): Promise<void> {
  const id = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/");

  // Verify it exists and is active.
  const r = await query<{ id: string }>(
    `SELECT id::text FROM regions WHERE id = $1::bigint AND is_active = TRUE LIMIT 1`,
    [id],
  );
  if (r.rows.length === 0) redirect("/");

  const jar = await cookies();
  jar.set(REGION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  const next = String(formData.get("next") ?? "/listings");
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/listings");
}

export async function clearRegion(): Promise<void> {
  const jar = await cookies();
  jar.delete(REGION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Enter a sandbox/test region. Unlike setRegion this accepts an inactive
 *  region, but only when the caller is its provisioned owner (or an admin) —
 *  so the prospect can browse + sell inside their private sandbox. */
export async function enterSandbox(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/partner");

  const r = await query<{ id: string }>(
    `SELECT id::text FROM regions
      WHERE id = $1::bigint AND is_test = TRUE
        AND ($2 OR sandbox_user_id = $3::bigint)
      LIMIT 1`,
    [id, user.isAdmin, user.id],
  );
  if (r.rows.length === 0) redirect("/partner");

  const jar = await cookies();
  jar.set(REGION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  revalidatePath("/", "layout");
  const next = String(formData.get("next") ?? "/listings");
  redirect(next.startsWith("/") ? next : "/listings");
}

/** Leave the sandbox — clears the region cookie so the next request
 *  re-resolves to the user's real (active) region or the picker. */
export async function exitSandbox(formData: FormData): Promise<void> {
  const jar = await cookies();
  jar.delete(REGION_COOKIE);
  revalidatePath("/", "layout");
  const next = String(formData.get("next") ?? "/partner");
  redirect(next.startsWith("/") ? next : "/partner");
}

// ---------- Admin CRUD ----------

export async function createRegion(formData: FormData): Promise<void> {
  await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect("/admin/regions?error=missing-label");

  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(label);
  if (!slug) redirect("/admin/regions?error=missing-slug");

  const short_name =
    String(formData.get("short_name") ?? "").trim() || null;
  const match_pattern =
    String(formData.get("match_pattern") ?? "").trim() || null;
  const sort_order = Number.parseInt(
    String(formData.get("sort_order") ?? "0"),
    10,
  );

  await query(
    `INSERT INTO regions (slug, label, short_name, match_pattern, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (slug) DO NOTHING`,
    [
      slug,
      label,
      short_name,
      match_pattern,
      Number.isFinite(sort_order) ? sort_order : 0,
    ],
  );

  revalidatePath("/admin/regions");
  revalidatePath("/", "layout");
  redirect("/admin/regions");
}

export async function updateRegion(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/regions");

  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirect("/admin/regions?error=missing-label");

  const short_name =
    String(formData.get("short_name") ?? "").trim() || null;
  const match_pattern =
    String(formData.get("match_pattern") ?? "").trim() || null;
  const sort_order = Number.parseInt(
    String(formData.get("sort_order") ?? "0"),
    10,
  );
  const is_active = formData.get("is_active") === "on";

  await query(
    `UPDATE regions
        SET label = $1,
            short_name = $2,
            match_pattern = $3,
            sort_order = $4,
            is_active = $5
      WHERE id = $6::bigint`,
    [
      label,
      short_name,
      match_pattern,
      Number.isFinite(sort_order) ? sort_order : 0,
      is_active,
      id,
    ],
  );

  revalidatePath("/admin/regions");
  revalidatePath("/", "layout");
  redirect("/admin/regions");
}

export async function deleteRegion(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/admin/regions");

  await query(`DELETE FROM regions WHERE id = $1::bigint`, [id]);

  revalidatePath("/admin/regions");
  revalidatePath("/", "layout");
  redirect("/admin/regions");
}

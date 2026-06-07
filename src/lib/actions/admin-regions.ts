"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import {
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";

const detail = (id: string) => `/admin/regions/${id}`;

/**
 * Assign a region's partner from the admin region page. A region holds at
 * most one partner (enforced by a unique index), and reassigning in place
 * is intentionally not allowed — to hand a region to someone else an admin
 * unassigns the current partner first. So this refuses a region that
 * already has one, then grants it with a fresh 12-month free window.
 */
export async function setRegionPartner(formData: FormData): Promise<void> {
  await requireAdmin();
  const regionId = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(regionId)) redirect("/admin/regions");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect(`${detail(regionId)}?error=email`);

  const u = await query<{ id: string }>(
    `SELECT id::text FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const newUserId = u.rows[0]?.id;
  if (!newUserId) redirect(`${detail(regionId)}?error=user-not-found`);

  const existing = await query(
    `SELECT 1 FROM partner_marketing_regions WHERE region_id = $1::bigint LIMIT 1`,
    [regionId],
  );
  if (existing.rows.length > 0) {
    redirect(`${detail(regionId)}?error=already-assigned`);
  }

  // Partners run one region — refuse if this account already holds a real
  // (non-sandbox) region.
  const held = await query(
    `SELECT 1 FROM partner_marketing_regions pmr
       JOIN regions rg ON rg.id = pmr.region_id
      WHERE pmr.user_id = $1::bigint AND rg.is_test = FALSE
      LIMIT 1`,
    [newUserId],
  );
  if (held.rows.length > 0) {
    redirect(`${detail(regionId)}?error=already-partner`);
  }

  try {
    await withTransaction(async (c) => {
      await c.query(
        `INSERT INTO partner_marketing_regions
           (user_id, region_id, listing_fee_cents, activated_at, free_until, platform_fee_pct)
         VALUES ($1::bigint, $2::bigint, 0, NOW(),
                 NOW() + (INTERVAL '1 month' * $3::int), $4)`,
        [newUserId, regionId, PARTNER_FREE_MONTHS, PARTNER_PLATFORM_FEE_PCT],
      );
      await c.query(`UPDATE users SET is_partner = TRUE WHERE id = $1::bigint`, [
        newUserId,
      ]);
    });
  } catch {
    redirect(`${detail(regionId)}?error=assign`);
  }

  revalidatePath(detail(regionId));
  revalidatePath("/admin/regions");
  redirect(`${detail(regionId)}?done=assigned`);
}

/** Remove a region's partner; demote them if they hold no other region. */
export async function unassignRegionPartner(formData: FormData): Promise<void> {
  await requireAdmin();
  const regionId = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(regionId)) redirect("/admin/regions");

  await withTransaction(async (c) => {
    const cur = await c.query<{ user_id: string }>(
      `SELECT user_id::text FROM partner_marketing_regions WHERE region_id = $1::bigint`,
      [regionId],
    );
    const oldUserId = cur.rows[0]?.user_id ?? null;
    await c.query(
      `DELETE FROM partner_marketing_regions WHERE region_id = $1::bigint`,
      [regionId],
    );
    if (oldUserId) {
      await c.query(
        `UPDATE users SET is_partner = FALSE
          WHERE id = $1::bigint
            AND NOT EXISTS (
              SELECT 1 FROM partner_marketing_regions WHERE user_id = $1::bigint
            )`,
        [oldUserId],
      );
    }
  });

  revalidatePath(detail(regionId));
  revalidatePath("/admin/regions");
  redirect(`${detail(regionId)}?done=unassigned`);
}

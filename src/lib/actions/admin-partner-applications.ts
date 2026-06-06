"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";
import {
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";

const PATH = "/admin/partner-applications";

function note(formData: FormData): string | null {
  const v = String(formData.get("note") ?? "").trim().slice(0, 500);
  return v.length > 0 ? v : null;
}

/** Where to land after the decision: a safe relative `from` (e.g. the
 *  region detail page) when provided, else the applications list. */
function backTo(formData: FormData, q: string): string {
  const f = String(formData.get("from") ?? "");
  const base = f.startsWith("/") && !f.startsWith("//") ? f : PATH;
  return base + (base.includes("?") ? "&" : "?") + q;
}

/**
 * Approve an application: grant the region, flag the user as a partner,
 * and start the 12-month free window (snapshotting the platform-fee rate).
 * The region's unique index guards against granting a region twice.
 */
export async function approveApplication(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect(PATH);
  const decisionNote = note(formData);

  try {
    await withTransaction(async (c) => {
      const a = await c.query<{
        user_id: string;
        region_id: string;
        status: string;
      }>(
        `SELECT user_id::text, region_id::text, status
           FROM partner_applications WHERE id = $1::bigint FOR UPDATE`,
        [id],
      );
      const app = a.rows[0];
      if (!app || app.status !== "pending") throw new Error("not-pending");

      await c.query(
        `INSERT INTO partner_marketing_regions
           (user_id, region_id, listing_fee_cents, activated_at, free_until,
            platform_fee_pct)
         VALUES ($1::bigint, $2::bigint, 0, NOW(),
                 NOW() + (INTERVAL '1 month' * $3::int), $4)`,
        [app.user_id, app.region_id, PARTNER_FREE_MONTHS, PARTNER_PLATFORM_FEE_PCT],
      );
      await c.query(`UPDATE users SET is_partner = TRUE WHERE id = $1::bigint`, [
        app.user_id,
      ]);
      await c.query(
        `UPDATE partner_applications
            SET status = 'approved', decided_at = NOW(),
                decided_by_user_id = $2::bigint, decision_note = $3
          WHERE id = $1::bigint`,
        [id, admin.id, decisionNote],
      );
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      redirect(backTo(formData, "error=taken"));
    }
    redirect(backTo(formData, "error=approve"));
  }

  revalidatePath(PATH);
  revalidatePath("/admin/regions");
  redirect(backTo(formData, "done=approved"));
}

/** Reject a pending application with an optional note. */
export async function rejectApplication(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect(PATH);

  await query(
    `UPDATE partner_applications
        SET status = 'rejected', decided_at = NOW(),
            decided_by_user_id = $2::bigint, decision_note = $3
      WHERE id = $1::bigint AND status = 'pending'`,
    [id, admin.id, note(formData)],
  );
  revalidatePath(PATH);
  redirect(backTo(formData, "done=rejected"));
}

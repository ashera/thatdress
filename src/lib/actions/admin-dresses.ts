"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendRelistNudge } from "@/lib/relist-nudge";

/**
 * Admin force-fires the relist-nudge for a single dress, bypassing
 * the time-based gates the cron route applies. Useful for testing
 * the email pipeline in production and for nudging a stale dress
 * on demand without waiting for the schedule. Still respects the
 * data-integrity gates inside sendRelistNudge (owner must exist,
 * not be suspended, and have a verified email).
 */
export async function forceRelistNudge(formData: FormData): Promise<void> {
  await requireAdmin();
  const dressId = String(formData.get("dressId") ?? "");
  const result = await sendRelistNudge(dressId);

  revalidatePath("/admin/dresses");

  const status = result.ok ? "sent" : result.reason;
  redirect(`/admin/dresses?nudge=${status}&id=${dressId}`);
}

/**
 * Admin hard-deletes a dress and everything attached to it. The dress
 * is the physical garment; deleting it cascades to every listing for
 * that dress (listings.dress_id ON DELETE CASCADE), and each listing
 * in turn cascades to its images, conversations, messages and offers.
 * The dress_ownership_events audit trail also cascades away. This is
 * irreversible and erases sale history — the dialog warns before it
 * gets here, and only an admin can reach it.
 */
export async function deleteDress(formData: FormData): Promise<void> {
  await requireAdmin();
  const dressId = String(formData.get("dressId") ?? "");
  if (!/^\d+$/.test(dressId)) {
    redirect("/admin/dresses?deleted=invalid");
  }

  const r = await query(`DELETE FROM dresses WHERE id = $1::bigint`, [dressId]);

  revalidatePath("/admin/dresses");
  revalidatePath("/admin/listings");
  redirect(`/admin/dresses?deleted=${r.rowCount ? "ok" : "not-found"}`);
}

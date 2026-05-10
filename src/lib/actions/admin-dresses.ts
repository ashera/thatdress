"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

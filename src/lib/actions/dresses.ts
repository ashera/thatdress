"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Owner-side response to a relist nudge — 'no thanks, keeping it'.
 * Flips disposition to 'kept' and clears the nudge timestamps so
 * the cron job stops firing emails about this dress. The dress
 * stays linked to the owner, so if they ever change their mind
 * they can still relist from /listings/mine (Phase 4 surfaces a
 * 'kept' affordance there in a follow-up).
 */
export async function markDressKept(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dressId = String(formData.get("dressId") ?? "");
  if (!/^\d+$/.test(dressId)) redirect("/listings/mine");

  const ownership = await query<{ id: string }>(
    `SELECT id::text FROM dresses
      WHERE id = $1::bigint
        AND current_owner_user_id = $2::bigint
      LIMIT 1`,
    [dressId, user.id],
  );
  if (!ownership.rows[0]) redirect("/listings/mine");

  await query(
    `UPDATE dresses
        SET disposition               = 'kept',
            next_relist_nudge_at      = NULL,
            last_relist_nudge_sent_at = NULL
      WHERE id = $1::bigint`,
    [dressId],
  );

  revalidatePath(`/dresses/${dressId}/relist`);
  revalidatePath("/listings/mine");
  redirect("/listings/mine?kept=1");
}

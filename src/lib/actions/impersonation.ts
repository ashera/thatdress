"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  endImpersonationSession,
  getCurrentUser,
  requireAdmin,
  startImpersonationSession,
} from "@/lib/auth";

/**
 * Start impersonating a user. Admin-only. Mints a fresh session for
 * the target with impersonator_user_id pointing back at the original
 * admin so the menu bar can show 'Acting as X' and we can swap back
 * via endImpersonation().
 *
 * Refuses to impersonate yourself or a suspended account — there's
 * no useful debugging that requires either, and impersonating a
 * suspended account would just log you out (getCurrentUser filters
 * out suspended_at IS NOT NULL).
 */
export async function startImpersonation(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const targetId = String(formData.get("targetUserId") ?? "");
  if (!/^\d+$/.test(targetId)) redirect("/admin/users");

  if (targetId === admin.id) {
    redirect(`/admin/users/${targetId}?error=self-impersonate`);
  }

  const r = await query<{ id: string; suspended_at: string | null }>(
    `SELECT id::text, suspended_at::text
       FROM users WHERE id = $1::bigint LIMIT 1`,
    [targetId],
  );
  if (!r.rows[0]) redirect("/admin/users");
  if (r.rows[0].suspended_at) {
    redirect(`/admin/users/${targetId}?error=cannot-impersonate-suspended`);
  }

  await startImpersonationSession(targetId, admin.id);
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * End the current impersonation and restore the admin's session.
 * Available to anyone whose session has impersonator_user_id set —
 * this is intentionally not requireAdmin-gated, because while
 * impersonating a non-admin the caller's User.isAdmin is FALSE and
 * requireAdmin() would redirect them away. The session row itself
 * is the trust check.
 */
export async function endImpersonation(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const adminId = await endImpersonationSession();
  revalidatePath("/", "layout");
  if (adminId) {
    // Land back on the user we were impersonating so the admin can
    // pick up where they left off.
    redirect(`/admin/users/${user.id}`);
  }
  redirect("/");
}

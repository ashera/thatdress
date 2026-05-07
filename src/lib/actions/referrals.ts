"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { findReferrerByCode } from "@/lib/referral";

const PAGE = "/admin/referrals";

/**
 * Admin-only manual attribution. Lets us retroactively fix referrals
 * that didn't auto-credit (e.g. users who signed up during the
 * MD5-backfilled-code regex bug, or anyone who registered without
 * following a /?ref= link but who we know was referred).
 *
 * The 'referrer' input accepts either an email or a referral code —
 * whichever the admin has at hand. Pass an empty referrer to clear
 * an existing attribution.
 *
 * Refuses self-referral and any non-existent target/referrer. Sets
 * referred_at = COALESCE(referred_at, NOW()) so reapplying the same
 * attribution doesn't reset the timestamp on existing data.
 */
export async function setUserReferrer(formData: FormData): Promise<void> {
  await requireAdmin();

  const userEmail = String(formData.get("user_email") ?? "")
    .trim()
    .toLowerCase();
  const referrerLookup = String(formData.get("referrer_lookup") ?? "").trim();

  if (!userEmail) redirect(`${PAGE}?attributed=missing-user`);

  const target = await query<{ id: string }>(
    `SELECT id::text FROM users WHERE email = $1 LIMIT 1`,
    [userEmail],
  );
  if (!target.rows[0]) redirect(`${PAGE}?attributed=user-not-found`);
  const targetId = target.rows[0].id;

  // Empty referrer → clear the attribution.
  if (!referrerLookup) {
    await query(
      `UPDATE users
          SET referred_by_user_id = NULL,
              referred_at = NULL
        WHERE id = $1::bigint`,
      [targetId],
    );
    revalidatePath(PAGE);
    revalidatePath("/profile/refer");
    redirect(`${PAGE}?attributed=cleared`);
  }

  // Resolve the referrer either by email (looks like one) or by code.
  let referrerId: string | null = null;
  if (referrerLookup.includes("@")) {
    const r = await query<{ id: string }>(
      `SELECT id::text FROM users
        WHERE email = $1 AND suspended_at IS NULL LIMIT 1`,
      [referrerLookup.toLowerCase()],
    );
    referrerId = r.rows[0]?.id ?? null;
  } else {
    referrerId = await findReferrerByCode(referrerLookup);
  }

  if (!referrerId) redirect(`${PAGE}?attributed=referrer-not-found`);
  if (referrerId === targetId) redirect(`${PAGE}?attributed=self-referral`);

  await query(
    `UPDATE users
        SET referred_by_user_id = $1::bigint,
            referred_at = COALESCE(referred_at, NOW())
      WHERE id = $2::bigint`,
    [referrerId, targetId],
  );

  revalidatePath(PAGE);
  revalidatePath("/profile/refer");
  redirect(`${PAGE}?attributed=ok`);
}

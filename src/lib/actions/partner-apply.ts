"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, getCurrentUser, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { dispatchVerificationEmail } from "@/lib/email-verify";
import { passwordMeetsRules } from "@/lib/password-rules";
import {
  ensureReferralCode,
  findReferrerByCode,
  REFERRAL_COOKIE,
} from "@/lib/referral";

const APPLY = "/partners/apply";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "").trim().slice(0, max);
  return v.length > 0 ? v : null;
}

/**
 * Streamlined signup for a prospective partner arriving on /partners/apply.
 * Captures name + contact + password inline (no detour through the standard
 * register page), creates the account, logs them in, and drops them back on
 * the apply page — now authenticated — to choose a region. Mirrors the
 * referral + verification-email behaviour of the main register action.
 */
export async function registerPartnerApplicant(
  formData: FormData,
): Promise<void> {
  if (await getCurrentUser()) redirect(APPLY);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = field(formData, "first_name", 64);
  const surname = field(formData, "surname", 64);
  const mobile = field(formData, "mobile", 32);

  if (!email || !EMAIL_RE.test(email)) redirect(`${APPLY}?error=invalid-email`);
  if (password.length > 72) redirect(`${APPLY}?error=long-password`);
  if (!passwordMeetsRules(password)) redirect(`${APPLY}?error=weak-password`);

  const password_hash = await hashPassword(password);

  // Honour an active ?ref= cookie just like the main register flow.
  const jar = await cookies();
  const refCode = jar.get(REFERRAL_COOKIE)?.value ?? null;
  const referrerId = refCode ? await findReferrerByCode(refCode) : null;

  let userId: string;
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, first_name, surname, mobile,
          referred_by_user_id, referred_at)
       VALUES ($1, $2, $3, $4, $5, $6::bigint,
               CASE WHEN $6 IS NULL THEN NULL ELSE NOW() END)
       RETURNING id::text`,
      [email, password_hash, firstName, surname, mobile, referrerId],
    );
    userId = result.rows[0]!.id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      redirect(`${APPLY}?error=email-taken`);
    }
    throw err;
  }

  await ensureReferralCode(userId);
  if (referrerId) jar.delete(REFERRAL_COOKIE);

  await createSession(userId);
  await dispatchVerificationEmail(userId, email);
  redirect(`${APPLY}?registered=1`);
}

/**
 * Submit a partner application for one region. Validates the region is
 * active and unclaimed; the partial unique index also blocks a duplicate
 * pending application for the same region by the same user.
 */
export async function applyForRegion(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(APPLY)}`);

  const regionId = String(formData.get("region_id") ?? "").trim();
  if (!/^\d+$/.test(regionId)) redirect(`${APPLY}?error=region`);

  // One application in flight at a time: block a new one while any of the
  // prospect's applications is still pending review.
  const pending = await query(
    `SELECT 1 FROM partner_applications
      WHERE user_id = $1::bigint AND status = 'pending' LIMIT 1`,
    [user.id],
  );
  if (pending.rows.length > 0) redirect(`${APPLY}?error=pending-exists`);

  const available = await query(
    `SELECT 1 FROM regions r
      WHERE r.id = $1::bigint AND r.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM partner_marketing_regions pmr WHERE pmr.region_id = r.id
        )
      LIMIT 1`,
    [regionId],
  );
  if (available.rows.length === 0) redirect(`${APPLY}?error=unavailable`);

  try {
    await query(
      `INSERT INTO partner_applications
         (user_id, region_id, business_name, pitch, expected_inventory)
       VALUES ($1::bigint, $2::bigint, $3, $4, $5)`,
      [
        user.id,
        regionId,
        field(formData, "business_name", 120),
        field(formData, "pitch", 2000),
        field(formData, "expected_inventory", 500),
      ],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      redirect(`${APPLY}?error=duplicate`);
    }
    throw e;
  }

  redirect(`${APPLY}?submitted=1`);
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { dispatchVerificationEmail } from "@/lib/email-verify";
import {
  ensureReferralCode,
  findReferrerByCode,
  REFERRAL_COOKIE,
} from "@/lib/referral";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCredentials(formData: FormData): {
  email: string;
  password: string;
  error?: string;
} {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL_RE.test(email)) {
    return { email, password, error: "invalid-email" };
  }
  if (password.length < 8) {
    return { email, password, error: "weak-password" };
  }
  if (password.length > 72) {
    return { email, password, error: "long-password" };
  }
  return { email, password };
}

export async function register(formData: FormData): Promise<void> {
  const { email, password, error } = parseCredentials(formData);
  if (error) {
    redirect(`/register?error=${error}`);
  }

  const password_hash = await hashPassword(password);

  // Resolve any active ?ref= cookie into a referrer user id BEFORE
  // we INSERT, so we can stamp referred_by_user_id and referred_at in
  // the same row write.
  const cookieStore = await cookies();
  const refCode = cookieStore.get(REFERRAL_COOKIE)?.value ?? null;
  const referrerId = refCode ? await findReferrerByCode(refCode) : null;

  let userId: string;
  try {
    const result = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, referred_by_user_id, referred_at)
         VALUES ($1, $2, $3::bigint, CASE WHEN $3 IS NULL THEN NULL ELSE NOW() END)
         RETURNING id::text`,
      [email, password_hash, referrerId],
    );
    userId = result.rows[0]!.id;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      redirect("/register?error=email-taken");
    }
    throw err;
  }

  // Issue the new user their own referral code right away so the
  // /profile/refer page has something to show on first visit.
  await ensureReferralCode(userId);

  // Burn the cookie now that we've credited the referrer — re-using
  // the same code for an unrelated future signup on the same browser
  // would be wrong attribution.
  if (referrerId) {
    cookieStore.delete(REFERRAL_COOKIE);
  }

  await createSession(userId);
  // Fire-and-forget — don't block signup if Resend is down or unset.
  await dispatchVerificationEmail(userId, email);
  redirect("/");
}

const TITLES = new Set(["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"]);

function clean(
  formData: FormData,
  key: string,
  max: number,
): string | null {
  const v = String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
  return v.length > 0 ? v : null;
}

/**
 * Parse an inches input from a form field. Allows blanks (returns
 * null) and clamps to a sane range so a typo doesn't poison the
 * fit calculator with absurd values.
 */
function cleanInches(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 20 || n > 70) return null;
  // Round to one decimal — matches NUMERIC(4,1) on the column.
  return Math.round(n * 10) / 10;
}

export async function updateProfile(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const titleRaw = clean(formData, "title", 16);
  const title = titleRaw && TITLES.has(titleRaw) ? titleRaw : null;
  const firstName = clean(formData, "first_name", 64);
  const surname = clean(formData, "surname", 64);
  const town = clean(formData, "town", 64);
  const postcode = clean(formData, "postcode", 16);
  const bust = cleanInches(formData, "bust_inches");
  const waist = cleanInches(formData, "waist_inches");
  const hips = cleanInches(formData, "hips_inches");

  await query(
    `UPDATE users
        SET title = $1,
            first_name = $2,
            surname = $3,
            town = $4,
            postcode = $5,
            bust_inches = $7,
            waist_inches = $8,
            hips_inches = $9
      WHERE id = $6::bigint`,
    [title, firstName, surname, town, postcode, user.id, bust, waist, hips],
  );

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function login(formData: FormData): Promise<void> {
  const { email, password, error } = parseCredentials(formData);
  if (error) {
    redirect(`/login?error=invalid-credentials`);
  }

  const result = await query<{
    id: string;
    password_hash: string;
    suspended_at: string | null;
  }>(
    "SELECT id::text, password_hash, suspended_at::text FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  const user = result.rows[0];
  if (!user) {
    redirect("/login?error=invalid-credentials");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    redirect("/login?error=invalid-credentials");
  }
  if (user.suspended_at) {
    redirect("/login?error=suspended");
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { passwordMeetsRules } from "@/lib/password-rules";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Readable alphabet — drops chars that look alike on a phone screen
// (0/O, 1/I/l). Composed from three buckets so we can guarantee the
// generated password contains at least one capital + one digit, the
// same complexity we enforce on user-chosen passwords.
const TEMP_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_LOWER = "abcdefghjkmnpqrstuvwxyz";
const TEMP_DIGIT = "23456789";
const TEMP_ALPHABET = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT;

function pickFrom(alphabet: string, byte: number): string {
  return alphabet[byte % alphabet.length];
}

function generateTempPassword(): string {
  const len = 12;
  const bytes = randomBytes(len + 3);
  // Seed one of each required class first, then fill the rest from
  // the union; finally shuffle so the required chars aren't always
  // in the same positions.
  const required = [
    pickFrom(TEMP_UPPER, bytes[0]),
    pickFrom(TEMP_LOWER, bytes[1]),
    pickFrom(TEMP_DIGIT, bytes[2]),
  ];
  const filler: string[] = [];
  for (let i = 0; i < len - required.length; i++) {
    filler.push(pickFrom(TEMP_ALPHABET, bytes[3 + i]));
  }
  const all = [...required, ...filler];
  // Fisher-Yates shuffle using a fresh random byte stream.
  const shuffleBytes = randomBytes(all.length);
  for (let i = all.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join("");
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) redirect("/forgot?sent=1");

  // Lookup is silent — we always show the same confirmation to avoid
  // letting attackers enumerate which addresses exist.
  let userId: string | null = null;
  try {
    const r = await query<{ id: string }>(
      `SELECT id::text FROM users
        WHERE email = $1 AND suspended_at IS NULL
        LIMIT 1`,
      [email],
    );
    userId = r.rows[0]?.id ?? null;
  } catch {
    // ignore
  }

  if (userId) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    try {
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1::bigint, $2, $3)`,
        [userId, hashToken(token), expiresAt],
      );

      const baseUrl = await getEmailBaseUrl();
      const url = `${baseUrl}/reset/${token}`;
      const body = `
        <p>Someone (hopefully you) asked to reset the password for the frockd account at <strong>${escapeHtml(email)}</strong>.</p>
        <p>Click the button to set a new password. The link expires in 1 hour and can only be used once.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Reset password</a>
        </p>
        <p style="font-size:13px;color:#7a7470;">If the button doesn't work, copy and paste this link into your browser:<br>
          <span style="word-break:break-all;">${escapeHtml(url)}</span>
        </p>
        <p style="font-size:13px;color:#7a7470;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `;

      await sendEmail({
        to: email,
        subject: "Reset your frockd password",
        html: emailLayout({
          preheader: "Reset your frockd password",
          heading: "Reset your password",
          body,
        }),
        text: `Reset your password by visiting:\n${url}\n\nThe link expires in 1 hour.`,
      });
    } catch (e) {
      // Log and fall through to confirmation page so we don't leak detail.
      // eslint-disable-next-line no-console
      console.error("[password-reset] send failed", e);
    }
  }

  redirect("/forgot?sent=1");
}

export async function resetPassword(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!token) redirect("/forgot");
  if (!passwordMeetsRules(password)) {
    redirect(`/reset/${token}?error=weak-password`);
  }

  const r = await query<{ id: string; user_id: string }>(
    `SELECT id::text, user_id::text
       FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1`,
    [hashToken(token)],
  );
  const tok = r.rows[0];
  if (!tok) {
    redirect(`/reset/${token}?error=invalid`);
  }

  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2::bigint`,
      [passwordHash, tok.user_id],
    );
    // Burn this token + invalidate any other outstanding tokens for safety.
    await client.query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE user_id = $1::bigint AND used_at IS NULL`,
      [tok.user_id],
    );
    // Log out other devices.
    await client.query(
      `DELETE FROM sessions WHERE user_id = $1::bigint`,
      [tok.user_id],
    );
  });

  revalidatePath("/", "layout");
  redirect("/login?reset=1");
}

/**
 * Admin-initiated password reset. Generates a single-use temp
 * password, sets it on the target user, kills every session, and
 * burns any outstanding reset tokens. The plain-text password is
 * returned in the redirect query so the admin sees it once on the
 * user detail page — they should communicate it to the user via a
 * trusted channel (and the user can change it from /profile).
 *
 * Admin cannot use this to reset their own password — they must use
 * the public /forgot flow so the reset goes to their own inbox.
 */
export async function adminResetUserPassword(
  formData: FormData,
): Promise<void> {
  const me = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!/^\d+$/.test(userId)) redirect("/admin/users");
  if (userId === me.id) {
    redirect(`/admin/users/${userId}?error=self-reset`);
  }

  // Confirm the target exists before mutating anything.
  const r = await query<{ id: string }>(
    `SELECT id::text FROM users WHERE id = $1::bigint LIMIT 1`,
    [userId],
  );
  if (!r.rows[0]) redirect("/admin/users");

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2::bigint`,
      [passwordHash, userId],
    );
    await client.query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE user_id = $1::bigint AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `DELETE FROM sessions WHERE user_id = $1::bigint`,
      [userId],
    );
  });

  revalidatePath(`/admin/users/${userId}`);
  redirect(
    `/admin/users/${userId}?temp_password=${encodeURIComponent(tempPassword)}`,
  );
}

"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  emailLayout,
  escapeHtml,
  getBaseUrl,
  sendEmail,
} from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

      const baseUrl = await getBaseUrl();
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
  if (password.length < 8 || password.length > 72) {
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

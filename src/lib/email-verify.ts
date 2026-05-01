import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import {
  emailLayout,
  escapeHtml,
  getBaseUrl,
  sendEmail,
} from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a verification token, persist it, and send the email.
 * Failures are logged but never thrown — registration shouldn't fail just
 * because email send is broken.
 */
export async function dispatchVerificationEmail(
  userId: string,
  email: string,
): Promise<void> {
  try {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1::bigint, $2, $3)`,
      [userId, hashToken(token), expiresAt],
    );

    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/verify/${token}`;

    await sendEmail({
      to: email,
      subject: "Verify your ebikeflip email",
      html: emailLayout({
        preheader: "Confirm your email to finish setup.",
        heading: "Verify your email",
        body: `
          <p>Welcome to ebikeflip. Click the button below to confirm <strong>${escapeHtml(email)}</strong> belongs to you. The link expires in 24 hours.</p>
          <p style="margin:24px 0;">
            <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Verify email</a>
          </p>
          <p style="font-size:13px;color:#7a7470;">Or paste this link into your browser:<br>
            <span style="word-break:break-all;">${escapeHtml(url)}</span>
          </p>
          <p style="font-size:13px;color:#7a7470;">If you didn't sign up for ebikeflip, you can ignore this message.</p>
        `,
      }),
      text: `Verify your ebikeflip email by visiting: ${url}\n\nThe link expires in 24 hours.`,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[email-verify] dispatch failed", e);
  }
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function verifyEmailByToken(token: string): Promise<VerifyResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const r = await query<{
    id: string;
    user_id: string;
    used_at: string | null;
    expired: boolean;
  }>(
    `SELECT id::text,
            user_id::text,
            used_at::text,
            (expires_at <= NOW()) AS expired
       FROM email_verification_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (row.expired) return { ok: false, reason: "expired" };

  await query(
    `UPDATE users SET email_verified_at = NOW() WHERE id = $1::bigint`,
    [row.user_id],
  );
  await query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1::bigint`,
    [row.id],
  );

  return { ok: true };
}

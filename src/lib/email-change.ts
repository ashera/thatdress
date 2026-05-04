import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import {
  emailLayout,
  escapeHtml,
  getBaseUrl,
  sendEmail,
} from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type DispatchResult =
  | { ok: true }
  | { ok: false; error: string };

export async function dispatchEmailChangeRequest(
  userId: string,
  currentEmail: string,
  newEmail: string,
): Promise<DispatchResult> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Invalidate any earlier pending change requests for this user.
  await query(
    `UPDATE email_change_tokens
        SET used_at = NOW()
      WHERE user_id = $1::bigint
        AND used_at IS NULL
        AND expires_at > NOW()`,
    [userId],
  );

  await query(
    `INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at)
     VALUES ($1::bigint, $2, $3, $4)`,
    [userId, newEmail, hashToken(token), expiresAt],
  );

  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/email-change/${token}`;

  const send = await sendEmail({
    to: newEmail,
    subject: "Confirm your new thatdress email",
    html: emailLayout({
      preheader: "Confirm the new email on your thatdress account.",
      heading: "Confirm your new email",
      body: `
        <p>You asked to change your thatdress login email from <strong>${escapeHtml(currentEmail)}</strong> to <strong>${escapeHtml(newEmail)}</strong>. Click the button below to make the switch — the link expires in 24 hours.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Confirm new email</a>
        </p>
        <p style="font-size:13px;color:#7a7470;">Or paste this link into your browser:<br>
          <span style="word-break:break-all;">${escapeHtml(url)}</span>
        </p>
        <p style="font-size:13px;color:#7a7470;">If you didn&rsquo;t request this, you can ignore the message — your login email won&rsquo;t change.</p>
      `,
    }),
    text: `Confirm your new thatdress email by visiting: ${url}\n\nThe link expires in 24 hours. If you didn't request this, ignore the message.`,
  });

  if (!send.ok) {
    return { ok: false, error: send.error };
  }
  return { ok: true };
}

export type ConfirmResult =
  | { ok: true; newEmail: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "taken" };

export async function confirmEmailChangeByToken(
  token: string,
): Promise<ConfirmResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const r = await query<{
    id: string;
    user_id: string;
    new_email: string;
    used_at: string | null;
    expired: boolean;
  }>(
    `SELECT id::text,
            user_id::text,
            new_email,
            used_at::text,
            (expires_at <= NOW()) AS expired
       FROM email_change_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hashToken(token)],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (row.expired) return { ok: false, reason: "expired" };

  try {
    await query(
      `UPDATE users
          SET email = $1,
              email_verified_at = NOW()
        WHERE id = $2::bigint`,
      [row.new_email, row.user_id],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }

  await query(
    `UPDATE email_change_tokens SET used_at = NOW() WHERE id = $1::bigint`,
    [row.id],
  );

  return { ok: true, newEmail: row.new_email };
}

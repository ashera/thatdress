import "server-only";
import { headers } from "next/headers";

const FROM_DEFAULT = "frockd <noreply@frockd.com.au>";

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Don't crash callers when email isn't configured (dev / preview).
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[email] RESEND_API_KEY not set — skipping send", {
        to: opts.to,
        subject: opts.subject,
      });
    }
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const from = process.env.RESEND_FROM ?? FROM_DEFAULT;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const error = await res.text().catch(() => `${res.status}`);
      return { ok: false, error: `Resend ${res.status}: ${error}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Resolve the public base URL for canonical / OG / sitemap links —
 *  i.e. URLs that should match the host the page was actually served
 *  at, so a request to www.frockd.com.au declares its canonical on
 *  www.frockd.com.au and not whatever internal hostname APP_URL is
 *  set to. Falls back to APP_URL for request-less contexts (cron
 *  jobs); hardcoded final fallback prevents broken URLs in
 *  tests / build-time edge cases.
 *
 *  Bare-hostname env values (e.g. Railway's
 *  "frockd-production.up.railway.app") are normalised to https://.
 *
 *  *Do not use this for transactional emails* — emails sent from a
 *  local dev server would carry localhost links the recipient can't
 *  reach. Use {@link getEmailBaseUrl} instead. */
export async function getBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("host");
    if (host) return `${proto}://${host}`;
  } catch {
    // No request context — fall through to APP_URL.
  }
  return appUrlOrDefault();
}

/** Resolve the base URL for absolute links inside transactional emails
 *  (verify, password reset, notifications, saved-search digest).
 *
 *  Prefers `APP_URL` when set so emails sent from a local dev server
 *  still link to a publicly-reachable domain — otherwise the recipient
 *  clicks a `http://localhost:3000/verify?token=...` link from their
 *  inbox and gets "this site can't be reached". Only falls back to the
 *  request host when APP_URL is unset (i.e. a deployment without that
 *  env var, where the request host is necessarily public). */
export async function getEmailBaseUrl(): Promise<string> {
  const fromEnv = appUrlOrDefault({ skipHardcoded: true });
  if (fromEnv) return fromEnv;
  return getBaseUrl();
}

function appUrlOrDefault(opts?: { skipHardcoded?: boolean }): string {
  const raw = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }
  if (opts?.skipHardcoded) return "";
  return "https://www.frockd.com.au";
}

/** Wrap a fragment of inner HTML with a minimal email shell. */
export function emailLayout(opts: {
  preheader?: string;
  heading: string;
  body: string;
}): string {
  const { preheader = "", heading, body } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1816;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e9e5df;padding:32px;">
          <tr>
            <td style="padding-bottom:8px;font-size:13px;color:#867f76;font-family:'Courier New',monospace;letter-spacing:0.08em;text-transform:uppercase;">
              frockd
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:#1c1816;">
              ${escapeHtml(heading)}
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.55;color:#3a342f;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding-top:32px;font-size:12px;color:#a39d96;border-top:1px solid #e9e5df;margin-top:24px;">
              frockd &middot; peer-to-peer formal-dress marketplace
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export { escapeHtml };

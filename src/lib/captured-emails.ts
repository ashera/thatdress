import "server-only";
import { query } from "@/lib/db";

/**
 * Read access to the sent_emails capture table (populated only when the
 * app runs with EMAIL_CAPTURE=1 — see sendEmail). Powers the local
 * "Captured emails" admin inbox.
 */

export type CapturedEmailRow = {
  id: string;
  to_email: string;
  subject: string;
  created_at: string;
};

export type CapturedEmail = CapturedEmailRow & { html: string | null };

export async function listCapturedEmails(limit = 100): Promise<CapturedEmailRow[]> {
  try {
    const r = await query<CapturedEmailRow>(
      `SELECT id::text, to_email, subject, created_at::text
         FROM sent_emails
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export async function getCapturedEmail(id: string): Promise<CapturedEmail | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<CapturedEmail>(
      `SELECT id::text, to_email, subject, html, created_at::text
         FROM sent_emails
        WHERE id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Pull actionable http(s) links out of an email body, de-duplicated and
 *  in document order, so the inbox can offer them as clickable buttons. */
export function extractLinks(html: string | null): string[] {
  if (!html) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

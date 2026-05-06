import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getEmailBaseUrl } from "@/lib/email";
import {
  emailSavedSearchDigest,
  findNewMatches,
} from "@/lib/saved-searches";

export const dynamic = "force-dynamic";

const DIGEST_LIMIT = 10;
const FALLBACK_WINDOW_HOURS = 24;

type Row = {
  id: string;
  user_id: string;
  user_email: string | null;
  name: string;
  params_json: Record<string, unknown>;
  last_emailed_at: string | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let rows: Row[];
  try {
    const r = await query<Row>(
      `SELECT s.id::text,
              s.user_id::text,
              u.email AS user_email,
              s.name,
              s.params_json,
              s.last_emailed_at::text
         FROM saved_searches s
         JOIN users u ON u.id = s.user_id
        WHERE u.suspended_at IS NULL
          AND u.email_verified_at IS NOT NULL
        ORDER BY s.id`,
    );
    rows = r.rows;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db error" },
      { status: 500 },
    );
  }

  const baseUrl = await getEmailBaseUrl();
  const stats = { searches: rows.length, sent: 0, errors: 0 };

  for (const row of rows) {
    try {
      const since =
        row.last_emailed_at ??
        new Date(
          Date.now() - FALLBACK_WINDOW_HOURS * 60 * 60 * 1000,
        ).toISOString();

      const matches = await findNewMatches(
        row.params_json,
        since,
        DIGEST_LIMIT,
      );
      if (matches.length === 0) continue;
      if (!row.user_email) continue;

      await emailSavedSearchDigest({
        to: row.user_email,
        searchName: row.name,
        searchId: row.id,
        matches,
        baseUrl,
      });

      await query(
        `UPDATE saved_searches SET last_emailed_at = NOW() WHERE id = $1::bigint`,
        [row.id],
      );
      stats.sent++;
    } catch (e) {
      stats.errors++;
      // eslint-disable-next-line no-console
      console.error("[cron/saved-searches] failed", row.id, e);
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

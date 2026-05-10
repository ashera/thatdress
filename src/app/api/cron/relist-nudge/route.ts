import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendRelistNudge } from "@/lib/relist-nudge";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 200;

type DueRow = { dress_id: string };

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let rows: DueRow[];
  try {
    const r = await query<DueRow>(
      `SELECT d.id::text AS dress_id
         FROM dresses d
         JOIN users u ON u.id = d.current_owner_user_id
        WHERE d.disposition = 'in-use'
          AND d.next_relist_nudge_at IS NOT NULL
          AND d.next_relist_nudge_at <= NOW()
          AND (
            d.last_relist_nudge_sent_at IS NULL
            OR d.last_relist_nudge_sent_at < NOW() - INTERVAL '60 days'
          )
          AND u.suspended_at IS NULL
          AND u.email_verified_at IS NOT NULL
        ORDER BY d.next_relist_nudge_at
        LIMIT $1`,
      [BATCH_LIMIT],
    );
    rows = r.rows;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db error" },
      { status: 500 },
    );
  }

  const stats = { candidates: rows.length, sent: 0, errors: 0 };

  for (const row of rows) {
    const result = await sendRelistNudge(row.dress_id);
    if (result.ok) {
      stats.sent++;
    } else {
      stats.errors++;
      // eslint-disable-next-line no-console
      console.error(
        "[cron/relist-nudge] failed",
        row.dress_id,
        result.reason,
        result.detail ?? "",
      );
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

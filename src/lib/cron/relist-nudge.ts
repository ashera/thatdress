import "server-only";
import { query } from "@/lib/db";
import { sendRelistNudge } from "@/lib/relist-nudge";

const BATCH_LIMIT = 200;

export type RelistNudgeRunStats = {
  candidates: number;
  sent: number;
  errors: number;
};

/**
 * Find dresses whose relist-nudge schedule is due, then email each
 * one's current owner. Used by both the /api/cron/relist-nudge
 * route and the admin page-load piggyback. The SQL filter is the
 * rate limiter: a dress that was just nudged falls out of the
 * candidate set for 60 days, so calling this on every admin page
 * load doesn't re-email the same owner.
 */
export async function runRelistNudgeBatch(): Promise<RelistNudgeRunStats> {
  const r = await query<{ dress_id: string }>(
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

  const stats: RelistNudgeRunStats = {
    candidates: r.rows.length,
    sent: 0,
    errors: 0,
  };

  for (const row of r.rows) {
    const result = await sendRelistNudge(row.dress_id);
    if (result.ok) {
      stats.sent++;
    } else {
      stats.errors++;
      // eslint-disable-next-line no-console
      console.error(
        "[runRelistNudgeBatch] failed",
        row.dress_id,
        result.reason,
        result.detail ?? "",
      );
    }
  }

  return stats;
}

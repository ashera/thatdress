import "server-only";
import { query } from "@/lib/db";
import { getEmailBaseUrl } from "@/lib/email";
import { emailSavedSearchDigest, findNewMatches } from "@/lib/saved-searches";

const DIGEST_LIMIT = 10;
const FALLBACK_WINDOW_HOURS = 24;

export type SavedSearchRunStats = {
  searches: number;
  sent: number;
  errors: number;
};

type Row = {
  id: string;
  user_id: string;
  user_email: string | null;
  name: string;
  params_json: Record<string, unknown>;
  last_emailed_at: string | null;
};

/**
 * Iterate every saved search owned by a verified, non-suspended
 * user; for any with new matches since the last digest (or the
 * 24h fallback window) email a fresh digest and stamp
 * last_emailed_at. The per-row last_emailed_at gate is the rate
 * limiter — calling this on every admin page load won't re-send
 * a digest that's already been delivered for the same matches.
 */
export async function runSavedSearchDigest(): Promise<SavedSearchRunStats> {
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

  const baseUrl = await getEmailBaseUrl();
  const stats: SavedSearchRunStats = {
    searches: r.rows.length,
    sent: 0,
    errors: 0,
  };

  for (const row of r.rows) {
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
      console.error("[runSavedSearchDigest] failed", row.id, e);
    }
  }

  return stats;
}

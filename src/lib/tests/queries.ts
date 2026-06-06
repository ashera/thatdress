import "server-only";
import { query } from "@/lib/db";

export type TestRow = {
  test_key: string;
  title: string;
  suite: string;
  description: string | null;
  status: string | null;
  duration_ms: number | null;
  error: string | null;
  last_run_at: string | null;
};

export type RunRow = {
  id: string;
  suite: string;
  target: string | null;
  trigger: string;
  status: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  started_at: string;
  finished_at: string | null;
};

/** Every catalogued test with its most recent result (or nulls if it has
 *  never run). Drives the main table on /admin/test-management. */
export async function getTestsWithLatestResult(): Promise<TestRow[]> {
  try {
    const r = await query<TestRow>(
      `SELECT t.test_key,
              t.title,
              t.suite,
              t.description,
              lr.status,
              lr.duration_ms,
              lr.error,
              lr.created_at::text AS last_run_at
         FROM tests t
         LEFT JOIN LATERAL (
           SELECT status, duration_ms, error, created_at
             FROM test_results r
            WHERE r.test_key = t.test_key
            ORDER BY r.created_at DESC
            LIMIT 1
         ) lr ON TRUE
        WHERE t.is_active = TRUE
        ORDER BY t.suite, t.title`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** Most recent suite executions. */
export async function getRecentRuns(limit = 15): Promise<RunRow[]> {
  try {
    const r = await query<RunRow>(
      `SELECT id::text, suite, target, trigger, status,
              total, passed, failed, skipped,
              started_at::text, finished_at::text
         FROM test_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** True when a run is currently in progress (drives auto-refresh + the
 *  disabled state on the Run buttons). */
export async function hasRunningRun(): Promise<boolean> {
  try {
    const r = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM test_runs WHERE status = 'running') AS exists`,
    );
    return r.rows[0]?.exists === true;
  } catch {
    return false;
  }
}

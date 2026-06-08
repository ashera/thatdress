import "server-only";
import { query } from "@/lib/db";
import { categorizeTest } from "./categories";

export type TestRow = {
  id: string;
  test_key: string;
  title: string;
  suite: string;
  file: string | null;
  description: string | null;
  status: string | null;
  duration_ms: number | null;
  error: string | null;
  last_run_at: string | null;
};

/** A test plus the two tidy-up fields the UI adds: a derived `category`
 *  and a stable, gap-free display number (`num`) assigned across the whole
 *  catalog. */
export type CatalogTest = TestRow & { category: string; num: number };

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
      `SELECT t.id::text,
              t.test_key,
              t.title,
              t.suite,
              t.file,
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

const SUITE_ORDER: Record<string, number> = { smoke: 0, local: 1 };

/** Augment the raw test rows with a derived category and a tidy, gap-free
 *  display number. Numbering is deterministic — ordered by suite, then
 *  category, then title — so the same test shows the same number on the
 *  summary and on either detail page. */
export function buildCatalog(rows: TestRow[]): CatalogTest[] {
  const withCategory = rows.map((r) => ({
    ...r,
    category: categorizeTest(r.file, r.test_key),
  }));
  withCategory.sort((a, b) => {
    const s = (SUITE_ORDER[a.suite] ?? 9) - (SUITE_ORDER[b.suite] ?? 9);
    if (s !== 0) return s;
    const c = a.category.localeCompare(b.category);
    if (c !== 0) return c;
    const t = a.title.localeCompare(b.title);
    if (t !== 0) return t;
    return a.test_key.localeCompare(b.test_key);
  });
  return withCategory.map((r, i) => ({ ...r, num: i + 1 }));
}

/** Most recent suite executions, optionally filtered to one suite. */
export async function getRecentRuns(
  limit = 15,
  suite?: string,
): Promise<RunRow[]> {
  try {
    const r = await query<RunRow>(
      `SELECT id::text, suite, target, trigger, status,
              total, passed, failed, skipped,
              started_at::text, finished_at::text
         FROM test_runs
        WHERE ($2::text IS NULL OR suite = $2)
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit, suite ?? null],
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

import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

/**
 * Writes Playwright results straight into Postgres (tests / test_runs /
 * test_results), surfaced in /admin/test-management.
 *
 * - When triggered from the admin UI, the server pre-creates a test_runs
 *   row and passes its id as RUN_ID; this reporter finalizes that row.
 * - For a plain CLI run (RUN_ID unset) it opens its own run row so the
 *   run is still recorded.
 *
 * Results are buffered in memory during the run and flushed once in
 * onEnd, so we open a single short-lived connection.
 */

/** Read DATABASE_URL from the environment, falling back to .env.local so
 *  CLI runs work without exporting it first (matches `npm run dev`). */
function resolveDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local — fall through */
  }
  return null;
}

// Strip ANSI colour codes from error text. Built from the ESC char code
// so there's no control character literal in source.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

type Collected = {
  testKey: string;
  title: string;
  suite: string;
  file: string;
  status: string;
  durationMs: number;
  error: string | null;
  retries: number;
};

export default class DbReporter implements Reporter {
  private results = new Map<string, Collected>();
  private rootDir = process.cwd();

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir ?? process.cwd();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const titlePath = test.titlePath(); // ['', project, file, ...describe, title]
    const projectName = titlePath[1] || "";
    const fileRel = this.relFile(test.location.file);
    const suite =
      projectName === "smoke" || projectName === "local"
        ? projectName
        : fileRel.includes("local/")
          ? "local"
          : "smoke";
    // Stable, project-independent key: file path + describe/test titles.
    const testKey = [fileRel, ...titlePath.slice(3)].join(" › ");

    const errText = (result.error?.message ?? result.errors[0]?.message ?? "")
      .replace(ANSI, "")
      .trim();

    // Last onTestEnd per test wins → keeps the final attempt's outcome.
    this.results.set(testKey, {
      testKey,
      title: test.title,
      suite,
      file: fileRel,
      status: result.status,
      durationMs: Math.round(result.duration),
      error: errText ? errText.slice(0, 4000) : null,
      retries: result.retry,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const connectionString = resolveDatabaseUrl();
    if (!connectionString) {
      console.error("[db-reporter] DATABASE_URL not set — skipping DB write.");
      return;
    }

    const rows = [...this.results.values()];
    const passed = rows.filter((r) => r.status === "passed").length;
    const skipped = rows.filter((r) => r.status === "skipped").length;
    const failed = rows.length - passed - skipped;
    const total = rows.length;
    const runStatus = failed > 0 ? "failed" : "passed";
    const suite = rows[0]?.suite ?? "smoke";

    const envRunId = process.env.RUN_ID;
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");

      let runId: string;
      if (envRunId && /^\d+$/.test(envRunId)) {
        // Finalize the row the admin trigger pre-created.
        await client.query(
          `UPDATE test_runs
              SET status = $2, total = $3, passed = $4, failed = $5,
                  skipped = $6, finished_at = NOW()
            WHERE id = $1::bigint`,
          [envRunId, runStatus, total, passed, failed, skipped],
        );
        runId = envRunId;
      } else {
        // CLI run — open our own row.
        const r = await client.query<{ id: string }>(
          `INSERT INTO test_runs
             (suite, target, trigger, status, total, passed, failed, skipped, finished_at)
           VALUES ($1, $2, 'cli', $3, $4, $5, $6, $7, NOW())
           RETURNING id::text`,
          [
            suite,
            process.env.BASE_URL ?? null,
            runStatus,
            total,
            passed,
            failed,
            skipped,
          ],
        );
        runId = r.rows[0]!.id;
      }

      for (const row of rows) {
        await client.query(
          `INSERT INTO tests (test_key, title, suite, file, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (test_key) DO UPDATE
             SET title = EXCLUDED.title, suite = EXCLUDED.suite,
                 file = EXCLUDED.file, is_active = TRUE`,
          [row.testKey, row.title, row.suite, row.file],
        );
        await client.query(
          `INSERT INTO test_results
             (run_id, test_key, title, suite, status, duration_ms, error, retries)
           VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8)`,
          [
            runId,
            row.testKey,
            row.title,
            row.suite,
            row.status,
            row.durationMs,
            row.error,
            row.retries,
          ],
        );
      }

      await client.query("COMMIT");
      console.log(
        `[db-reporter] run ${runId}: ${passed}/${total} passed (${result.status}).`,
      );
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[db-reporter] failed to write results:", e);
    } finally {
      await client.end();
    }
  }

  private relFile(absFile: string): string {
    const rel = path.relative(this.rootDir, absFile).replace(/\\/g, "/");
    return rel.startsWith("..") ? path.basename(absFile) : rel;
  }
}

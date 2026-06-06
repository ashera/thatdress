"use server";

import { spawn } from "node:child_process";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

const SUITES = {
  smoke: "https://www.frockd.com.au",
  local: "http://localhost:3000",
} as const;
type Suite = keyof typeof SUITES;

function isSuite(v: string): v is Suite {
  return v === "smoke" || v === "local";
}

const ADMIN_PATH = "/admin/test-management";

/**
 * Trigger a Playwright run from the admin UI. Local-first: this spawns
 * Playwright on the machine serving the app (your PC during `npm run
 * dev`), so it only works when running locally. We pre-create the
 * test_runs row and pass its id as RUN_ID; the DB reporter finalizes it.
 */
export async function runTestSuite(formData: FormData): Promise<void> {
  await requireAdmin();

  const suite = String(formData.get("suite") ?? "");
  if (!isSuite(suite)) redirect(`${ADMIN_PATH}?error=bad-suite`);
  const target = SUITES[suite];

  // Pre-create the run row so the UI shows "running" immediately.
  const r = await query<{ id: string }>(
    `INSERT INTO test_runs (suite, target, trigger, status)
       VALUES ($1, $2, 'manual', 'running')
       RETURNING id::text`,
    [suite, target],
  );
  const runId = r.rows[0]!.id;

  // Spawn the suite detached-ish: we don't await it. The reporter writes
  // results + flips the run to passed/failed on completion. shell:true so
  // Windows resolves npx.cmd.
  try {
    const child = spawn(
      "npx",
      ["playwright", "test", `--project=${suite}`],
      {
        cwd: process.cwd(),
        env: { ...process.env, RUN_ID: runId },
        shell: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );

    // Safety net: if Playwright never starts or crashes before the
    // reporter finalizes the row, mark the run errored so it doesn't
    // hang on "running" forever.
    const markErroredIfStuck = () => {
      query(
        `UPDATE test_runs
            SET status = 'errored', finished_at = NOW()
          WHERE id = $1::bigint AND status = 'running'`,
        [runId],
      ).catch(() => {});
    };
    child.on("error", markErroredIfStuck);
    child.on("close", markErroredIfStuck);
  } catch {
    await query(
      `UPDATE test_runs SET status = 'errored', finished_at = NOW()
        WHERE id = $1::bigint`,
      [runId],
    );
  }

  revalidatePath(ADMIN_PATH);
  redirect(ADMIN_PATH);
}

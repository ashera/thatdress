import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { runTestSuite } from "@/lib/actions/admin-tests";
import {
  buildCatalog,
  getRecentRuns,
  getTestsWithLatestResult,
  hasRunningRun,
  type CatalogTest,
  type RunRow,
} from "@/lib/tests/queries";
import { SUITES, type Suite } from "@/lib/tests/categories";
import { Badge, Button } from "../../_components/ui";
import { AutoRefresh } from "./_auto-refresh";
import {
  CategoryChip,
  RunsTable,
  fmtWhen,
  statusBadge,
} from "./_shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test Management — Admin" };

const FAILED = new Set(["failed", "timedOut", "errored", "interrupted"]);

const SUITE_META: Record<Suite, { label: string; blurb: string }> = {
  smoke: {
    label: "Smoke",
    blurb: "Hit production read-only.",
  },
  local: {
    label: "Local",
    blurb: "Hit your local app + database.",
  },
};

function summarize(rows: CatalogTest[]) {
  const passed = rows.filter((t) => t.status === "passed").length;
  const failed = rows.filter((t) => FAILED.has(t.status ?? "")).length;
  const neverRun = rows.filter((t) => !t.status).length;
  const other = rows.length - passed - failed - neverRun;
  const catCounts = new Map<string, number>();
  for (const t of rows) {
    catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1);
  }
  const categories = [...catCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  return { total: rows.length, passed, failed, neverRun, other, categories };
}

export default async function TestManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  const [tests, runs, running] = await Promise.all([
    getTestsWithLatestResult(),
    getRecentRuns(15),
    hasRunningRun(),
  ]);
  const catalog = buildCatalog(tests);

  return (
    <div className="page page--pad">
      <AutoRefresh active={running} />

      <header style={{ marginBottom: "var(--s-6)" }}>
        <h1>Test Management</h1>
        <p className="sub">
          Playwright suites for frockd. Runs are triggered here and execute
          on the machine serving the app (your PC during local dev) —{" "}
          <strong>smoke</strong> tests hit production read-only;{" "}
          <strong>local</strong> tests hit your local app + database. Pick a
          suite below to see every test, its number and category.
        </p>
      </header>

      {error && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {error === "bad-suite"
            ? "Unknown test suite."
            : "Something went wrong starting the run."}
        </p>
      )}

      {/* Run controls */}
      <section
        className="form-card"
        style={{ marginBottom: "var(--s-6)", padding: "var(--s-5)" }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Run a suite
        </h2>
        <p className="card-sub" style={{ marginTop: 0, marginBottom: "var(--s-4)" }}>
          {running
            ? "A run is in progress — results refresh automatically."
            : "Kick off a suite. Tests run in the background; this page updates as results land."}
        </p>
        <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
          <form action={runTestSuite}>
            <input type="hidden" name="suite" value="smoke" />
            <Button type="submit" variant="primary" icon="bolt" disabled={running}>
              Run smoke (production)
            </Button>
          </form>
          <form action={runTestSuite}>
            <input type="hidden" name="suite" value="local" />
            <Button type="submit" variant="dark" icon="bolt" disabled={running}>
              Run local
            </Button>
          </form>
        </div>
      </section>

      {/* Suite summary cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--s-4)",
          marginBottom: "var(--s-6)",
        }}
      >
        {SUITES.map((suite) => {
          const rows = catalog.filter((t) => t.suite === suite);
          const s = summarize(rows);
          const latest = runs.find((r) => r.suite === suite) ?? null;
          return (
            <SuiteCard
              key={suite}
              suite={suite}
              summary={s}
              latest={latest}
            />
          );
        })}
      </section>

      {/* Recent runs */}
      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="card-sub">No runs yet.</p>
        ) : (
          <RunsTable runs={runs} />
        )}
      </section>
    </div>
  );
}

function SuiteCard({
  suite,
  summary,
  latest,
}: {
  suite: Suite;
  summary: ReturnType<typeof summarize>;
  latest: RunRow | null;
}) {
  const meta = SUITE_META[suite];
  const lb = latest ? statusBadge(latest.status) : null;
  return (
    <Link
      href={`/admin/test-management/${suite}`}
      className="form-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
        padding: "var(--s-5)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--s-2)",
        }}
      >
        <h2 className="card-heading" style={{ margin: 0 }}>
          {meta.label}
        </h2>
        <span style={{ color: "var(--volt-700)", fontWeight: 600, fontSize: 14 }}>
          View {summary.total} test{summary.total === 1 ? "" : "s"} →
        </span>
      </div>
      <p className="card-sub" style={{ margin: 0 }}>
        {meta.blurb}
      </p>

      <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
        <Badge variant="ok">{summary.passed} passed</Badge>
        {summary.failed > 0 && (
          <Badge variant="warn">{summary.failed} failing</Badge>
        )}
        {summary.neverRun > 0 && (
          <Badge variant="default">{summary.neverRun} never run</Badge>
        )}
        {summary.other > 0 && (
          <Badge variant="ink">{summary.other} other</Badge>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {summary.categories.map(([cat, n]) => (
          <CategoryChip key={cat} label={`${cat} · ${n}`} />
        ))}
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
        {latest && lb ? (
          <>
            Last run {fmtWhen(latest.started_at)} ·{" "}
            <Badge variant={lb.variant}>{lb.label}</Badge> · {latest.passed}/
            {latest.total} passed
          </>
        ) : (
          "Not run yet."
        )}
      </div>
    </Link>
  );
}

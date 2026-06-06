import { requireAdmin } from "@/lib/auth";
import { runTestSuite } from "@/lib/actions/admin-tests";
import {
  getRecentRuns,
  getTestsWithLatestResult,
  hasRunningRun,
  type RunRow,
  type TestRow,
} from "@/lib/tests/queries";
import { Badge, Button } from "../../_components/ui";
import { AutoRefresh } from "./_auto-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test Management — Admin" };

type BadgeVariant = "ok" | "warn" | "info" | "ink" | "default";

function statusBadge(status: string | null): {
  variant: BadgeVariant;
  label: string;
} {
  switch (status) {
    case "passed":
      return { variant: "ok", label: "passed" };
    case "failed":
    case "timedOut":
    case "errored":
    case "interrupted":
      return { variant: "warn", label: status };
    case "skipped":
      return { variant: "ink", label: "skipped" };
    case "running":
      return { variant: "info", label: "running" };
    default:
      return { variant: "default", label: "never run" };
  }
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function runDuration(run: RunRow): string {
  if (!run.finished_at) return "—";
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return fmtDuration(ms);
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

  const bySuite = (s: string) => tests.filter((t) => t.suite === s);

  return (
    <div className="page page--pad">
      <AutoRefresh active={running} />

      <header style={{ marginBottom: "var(--s-6)" }}>
        <h1>Test Management</h1>
        <p className="sub">
          Playwright suites for frockd. Runs are triggered here and execute
          on the machine serving the app (your PC during local dev) —{" "}
          <strong>smoke</strong> tests hit production read-only;{" "}
          <strong>local</strong> tests hit your local app + database.
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
            ? "A run is in progress — results refresh automatically below."
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

      {/* Tests + latest result */}
      <section className="form-card" style={{ marginBottom: "var(--s-6)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Tests &amp; latest result
        </h2>
        {tests.length === 0 ? (
          <p className="card-sub">
            No tests recorded yet — run a suite to populate this list.
          </p>
        ) : (
          (["smoke", "local"] as const).map((suite) =>
            bySuite(suite).length === 0 ? null : (
              <div key={suite} style={{ marginTop: "var(--s-4)" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                    margin: "0 0 var(--s-2)",
                  }}
                >
                  {suite}
                </h3>
                <TestTable rows={bySuite(suite)} />
              </div>
            ),
          )
        )}
      </section>

      {/* Recent runs */}
      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <p className="card-sub">No runs yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={cellHead}>#</th>
                  <th style={cellHead}>Suite</th>
                  <th style={cellHead}>Status</th>
                  <th style={cellHead}>Passed</th>
                  <th style={cellHead}>Started</th>
                  <th style={cellHead}>Duration</th>
                  <th style={cellHead}>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const b = statusBadge(run.status);
                  return (
                    <tr key={run.id}>
                      <td style={cell}>{run.id}</td>
                      <td style={cell}>{run.suite}</td>
                      <td style={cell}>
                        <Badge variant={b.variant}>{b.label}</Badge>
                      </td>
                      <td style={cell}>
                        {run.passed}/{run.total}
                        {run.failed > 0 ? ` · ${run.failed} failed` : ""}
                      </td>
                      <td style={cell}>{fmtWhen(run.started_at)}</td>
                      <td style={cell}>{runDuration(run)}</td>
                      <td style={cell}>{run.trigger}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--s-2) var(--s-3)",
  fontSize: 12,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  padding: "var(--s-2) var(--s-3)",
  fontSize: "var(--t-body-s)",
  borderBottom: "1px solid var(--hairline)",
  verticalAlign: "top",
};

function TestTable({ rows }: { rows: TestRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={cellHead}>Test</th>
            <th style={cellHead}>Latest</th>
            <th style={cellHead}>Last run</th>
            <th style={cellHead}>Duration</th>
            <th style={cellHead}>Last error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const b = statusBadge(t.status);
            return (
              <tr key={t.test_key}>
                <td style={cell}>{t.title}</td>
                <td style={cell}>
                  <Badge variant={b.variant}>{b.label}</Badge>
                </td>
                <td style={cell}>{fmtWhen(t.last_run_at)}</td>
                <td style={cell}>{fmtDuration(t.duration_ms)}</td>
                <td style={{ ...cell, maxWidth: 360 }}>
                  {t.error ? (
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-2)",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={t.error}
                    >
                      {t.error}
                    </code>
                  ) : (
                    <span style={{ color: "var(--ink-4)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

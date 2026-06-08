import { Badge } from "../../_components/ui";
import type { CatalogTest, RunRow } from "@/lib/tests/queries";

export type BadgeVariant = "ok" | "warn" | "info" | "ink" | "default";

export function statusBadge(status: string | null): {
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

export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function runDuration(run: RunRow): string {
  if (!run.finished_at) return "—";
  const ms =
    new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
  return fmtDuration(ms);
}

export const cellHead: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--s-2) var(--s-3)",
  fontSize: 12,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};

export const cell: React.CSSProperties = {
  padding: "var(--s-2) var(--s-3)",
  fontSize: "var(--t-body-s)",
  borderBottom: "1px solid var(--hairline)",
  verticalAlign: "top",
};

export function CategoryChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 999,
        background: "var(--surface-sunken)",
        border: "1px solid var(--hairline)",
        fontSize: 11,
        color: "var(--ink-2)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** The full per-test table for a detail page, grouped by category. */
export function TestTable({ rows }: { rows: CatalogTest[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...cellHead, width: 56 }}>#</th>
            <th style={cellHead}>Test</th>
            <th style={cellHead}>Category</th>
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
                <td
                  style={{
                    ...cell,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-4)",
                  }}
                >
                  #{t.num}
                </td>
                <td style={cell}>{t.title}</td>
                <td style={cell}>
                  <CategoryChip label={t.category} />
                </td>
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

/** Recent-runs table, shared by the summary and detail pages. */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  return (
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
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runTestSuite } from "@/lib/actions/admin-tests";
import {
  buildCatalog,
  getRecentRuns,
  getTestsWithLatestResult,
  hasRunningRun,
  type CatalogTest,
} from "@/lib/tests/queries";
import { isSuite, type Suite } from "@/lib/tests/categories";
import { Button } from "../../../_components/ui";
import { AutoRefresh } from "../_auto-refresh";
import { RunsTable, TestTable } from "../_shared";

export const dynamic = "force-dynamic";

const SUITE_META: Record<Suite, { label: string; blurb: string }> = {
  smoke: {
    label: "Smoke",
    blurb:
      "Production read-only checks — they hit the live site and never write data.",
  },
  local: {
    label: "Local",
    blurb:
      "Full end-to-end tests against your local app + database, including writes.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ suite: string }>;
}) {
  const { suite } = await params;
  const label = isSuite(suite) ? SUITE_META[suite].label : "Tests";
  return { title: `${label} tests — Admin` };
}

export default async function SuiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ suite: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { suite } = await params;
  if (!isSuite(suite)) notFound();
  const { error } = await searchParams;
  const meta = SUITE_META[suite];

  const [tests, runs, running] = await Promise.all([
    getTestsWithLatestResult(),
    getRecentRuns(15, suite),
    hasRunningRun(),
  ]);
  // Number across the whole catalog so a test's number is the same here as
  // on the summary, then narrow to this suite.
  const rows = buildCatalog(tests).filter((t) => t.suite === suite);

  // Group by category for display.
  const byCategory = new Map<string, CatalogTest[]>();
  for (const t of rows) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="page page--pad">
      <AutoRefresh active={running} />

      <Link href="/admin/test-management" className="back-link">
        ← Test Management
      </Link>

      <header style={{ margin: "var(--s-3) 0 var(--s-5)" }}>
        <p className="eyebrow">Admin · Tests</p>
        <h1 style={{ marginBottom: 4 }}>{meta.label} tests</h1>
        <p className="sub" style={{ margin: 0 }}>
          {meta.blurb} {rows.length} test{rows.length === 1 ? "" : "s"} across{" "}
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}.
        </p>
        <div style={{ marginTop: "var(--s-3)" }}>
          <form action={runTestSuite}>
            <input type="hidden" name="suite" value={suite} />
            <Button
              type="submit"
              variant={suite === "smoke" ? "primary" : "dark"}
              icon="bolt"
              disabled={running}
            >
              Run {meta.label.toLowerCase()}
            </Button>
          </form>
        </div>
      </header>

      {error && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {error === "bad-suite"
            ? "Unknown test suite."
            : "Something went wrong starting the run."}
        </p>
      )}

      {/* Tests grouped by category */}
      <section className="form-card" style={{ marginBottom: "var(--s-6)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Tests &amp; latest result
        </h2>
        {rows.length === 0 ? (
          <p className="card-sub">
            No {meta.label.toLowerCase()} tests recorded yet — run the suite to
            populate this list.
          </p>
        ) : (
          categories.map((cat) => (
            <div key={cat} style={{ marginTop: "var(--s-4)" }}>
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
                {cat} · {byCategory.get(cat)!.length}
              </h3>
              <TestTable rows={byCategory.get(cat)!} />
            </div>
          ))
        )}
      </section>

      {/* Recent runs for this suite */}
      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Recent {meta.label.toLowerCase()} runs
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

import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { renderMarkdown } from "@/lib/blog";
import { MermaidRenderer } from "../../../_components/mermaid-renderer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflow diagrams — Admin" };

async function loadFlows(): Promise<
  | { ok: true; html: string; mtime: string }
  | { ok: false; error: string }
> {
  const filePath = path.join(process.cwd(), "docs", "flows.md");
  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);
    return {
      ok: true,
      html: renderMarkdown(raw),
      mtime: stat.mtime.toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminDocsFlowsPage() {
  await requireAdmin();
  const result = await loadFlows();

  return (
    <div className="page admin-page" style={{ maxWidth: 1080 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Documentation</p>
        <h1>Workflow diagrams</h1>
        <p className="sub">
          Rendered view of <code>docs/flows.md</code>. Mermaid blocks
          are turned into inline SVG by the client. Edit the file in
          the repo to update this page.
        </p>
      </header>

      {result.ok ? (
        <>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              marginBottom: "var(--s-5)",
            }}
          >
            File last modified: {formatTime(result.mtime)}
          </div>
          <MermaidRenderer html={result.html} />
        </>
      ) : (
        <div className="form-error">
          <strong>Could not load docs/flows.md.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      )}
    </div>
  );
}

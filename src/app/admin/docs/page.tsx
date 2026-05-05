import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { renderMarkdown } from "@/lib/blog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project documentation — Admin" };

async function loadReadme(): Promise<{ ok: true; html: string; mtime: string } | { ok: false; error: string }> {
  // README.md sits at the repo root, which is process.cwd() in both
  // dev and the production Next.js server.
  const filePath = path.join(process.cwd(), "README.md");
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

export default async function AdminDocsPage() {
  await requireAdmin();
  const result = await loadReadme();

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Documentation</p>
        <h1>Project documentation</h1>
        <p className="sub">
          Rendered view of <code>README.md</code> at the repo root. Edit
          the file in the repo to update this page.
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
          <article
            className="prose"
            style={{
              background: "var(--surface)",
              padding: "var(--s-6) var(--s-7)",
              borderRadius: 14,
              border: "1px solid var(--hairline)",
            }}
            dangerouslySetInnerHTML={{ __html: result.html }}
          />
        </>
      ) : (
        <div className="form-error">
          <strong>Could not load README.md.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      )}
    </div>
  );
}

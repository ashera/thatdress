import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  deleteBlogKeyword,
  generateClusterFromKeyword,
  updateBlogKeyword,
} from "@/lib/actions/blog-builder";
import { Button, Field, Input, Textarea } from "../../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-phrase": "A phrase is required.",
  duplicate: "Another keyword already uses that phrase.",
  "no-key":
    "ANTHROPIC_API_KEY isn't set on the server — add it and redeploy to use this feature.",
  "claude-error":
    "Claude returned an error. Check server logs for details and try again.",
  "bad-output":
    "Claude returned an unparseable response. Try again.",
  "missing-root": "That keyword no longer exists.",
};

const INTENTS = [
  "informational",
  "commercial",
  "navigational",
  "transactional",
] as const;

const STATUSES = ["idea", "clustered", "drafted", "published"] as const;

const STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  clustered: "Clustered",
  drafted: "Drafted",
  published: "Published",
};

type KeywordRow = {
  id: string;
  phrase: string;
  intent: string | null;
  search_volume: number | null;
  difficulty: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default async function EditKeywordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error, saved } = await searchParams;
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  if (!/^\d+$/.test(id)) notFound();

  const [keywordRes, clustersRes] = await Promise.all([
    query<KeywordRow>(
      `SELECT id::text,
              phrase,
              intent,
              search_volume,
              difficulty,
              notes,
              status,
              created_at::text,
              updated_at::text
         FROM blog_keywords
        WHERE id = $1::bigint
        LIMIT 1`,
      [id],
    ),
    query<{
      id: string;
      name: string;
      intent: string | null;
      is_primary: boolean;
      member_count: string;
      created_at: string;
    }>(
      `SELECT c.id::text,
              c.name,
              c.intent,
              kc.is_primary,
              (SELECT COUNT(*)::text FROM blog_keyword_clusters
                WHERE cluster_id = c.id) AS member_count,
              c.created_at::text
         FROM blog_clusters c
         JOIN blog_keyword_clusters kc ON kc.cluster_id = c.id
        WHERE kc.keyword_id = $1::bigint
        ORDER BY c.created_at DESC`,
      [id],
    ),
  ]);
  const k = keywordRes.rows[0];
  if (!k) notFound();
  const clusters = clustersRes.rows;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/blog/builder" className="back-link">
        ← Keyword bank
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog · Builder</p>
        <h1>{k.phrase}</h1>
        <p className="sub">
          {STATUS_LABELS[k.status] ?? k.status} ·{" "}
          {k.intent ?? "no intent"} · added {formatDate(k.created_at)}
        </p>
      </header>

      {saved && !errorMessage && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}
      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMessage}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Cluster generation</h2>
        <p className="card-sub">
          Ask Claude to fan this root keyword out into a cluster of related
          queries that share the same search intent. The new keywords are
          added to the bank and linked here as a cluster.
        </p>

        {clusters.length > 0 && (
          <div style={{ marginBottom: "var(--s-4)" }}>
            <p
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: "0 0 var(--s-2)",
              }}
            >
              Clusters this keyword belongs to
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {clusters.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ fontWeight: 600, color: "var(--ink-1)" }}
                    >
                      {c.name}
                      {c.is_primary && (
                        <span
                          className="users-tag --admin"
                          style={{ marginLeft: 8 }}
                        >
                          Primary
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {c.intent ?? "no intent"} · {c.member_count} keywords ·{" "}
                      {formatDate(c.created_at)}
                    </div>
                  </div>
                  <Link
                    href={`/admin/blog/builder/cluster/${c.id}`}
                    style={{
                      fontWeight: 600,
                      color: "var(--ink-1)",
                      fontSize: "var(--t-body-s)",
                      textDecoration: "none",
                    }}
                  >
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={generateClusterFromKeyword}>
          <input type="hidden" name="keywordId" value={k.id} />
          <Button type="submit" variant={clusters.length > 0 ? "ghost" : "primary"}>
            {clusters.length > 0 ? "Regenerate cluster" : "Generate cluster"}
          </Button>
        </form>
        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 12,
            margin: "var(--s-3) 0 0",
          }}
        >
          Generation typically takes 5–15 seconds. The page will reload to
          the cluster review when it&rsquo;s done.
        </p>
      </section>

      <form
        action={updateBlogKeyword}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-4)",
        }}
      >
        <input type="hidden" name="keywordId" value={k.id} />

        <section className="form-card">
          <h2 className="card-heading">Keyword</h2>
          <Field label="Phrase" htmlFor="phrase">
            <Input
              id="phrase"
              name="phrase"
              required
              maxLength={200}
              defaultValue={k.phrase}
            />
          </Field>
          <div className="grid-2">
            <Field label="Intent" htmlFor="intent">
              <select
                id="intent"
                name="intent"
                className="input"
                defaultValue={k.intent ?? ""}
              >
                <option value="">—</option>
                {INTENTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                className="input"
                defaultValue={k.status}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Search volume" htmlFor="search_volume">
              <Input
                id="search_volume"
                name="search_volume"
                type="number"
                min={0}
                max={10_000_000}
                defaultValue={
                  k.search_volume != null ? String(k.search_volume) : ""
                }
              />
            </Field>
            <Field label="Difficulty" htmlFor="difficulty">
              <Input
                id="difficulty"
                name="difficulty"
                type="number"
                min={0}
                max={100}
                defaultValue={
                  k.difficulty != null ? String(k.difficulty) : ""
                }
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={4}
              maxLength={2000}
              defaultValue={k.notes ?? ""}
            />
          </Field>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" iconRight="arrow">
            Save changes
          </Button>
        </div>
      </form>

      <form
        action={deleteBlogKeyword}
        style={{
          marginTop: "var(--s-7)",
          paddingTop: "var(--s-5)",
          borderTop: "1px solid var(--hairline)",
          textAlign: "center",
        }}
      >
        <input type="hidden" name="keywordId" value={k.id} />
        <button
          type="submit"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--ink-3)",
            fontSize: "var(--t-body-s)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Delete this keyword
        </button>
      </form>
    </div>
  );
}

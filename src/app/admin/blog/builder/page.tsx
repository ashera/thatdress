import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ButtonLink, Input } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const STATUSES = ["idea", "clustered", "drafted", "published"] as const;
const INTENTS = [
  "informational",
  "commercial",
  "navigational",
  "transactional",
] as const;

const STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  clustered: "Clustered",
  drafted: "Drafted",
  published: "Published",
};

const STATUS_TONE: Record<string, string> = {
  idea: "--susp",
  clustered: "--admin",
  drafted: "--admin",
  published: "--ok",
};

type KeywordRow = {
  id: string;
  phrase: string;
  intent: string | null;
  search_volume: number | null;
  difficulty: number | null;
  status: string;
  notes: string | null;
  created_at: string;
};

type Search = {
  q?: string;
  status?: string;
  intent?: string;
  saved?: string;
  added?: string;
};

function buildWhere(s: Search): { where: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (s.q && s.q.trim()) {
    params.push(`%${s.q.trim().toLowerCase()}%`);
    where.push(`LOWER(phrase) LIKE $${params.length}`);
  }
  if (s.status && STATUSES.includes(s.status as (typeof STATUSES)[number])) {
    params.push(s.status);
    where.push(`status = $${params.length}`);
  }
  if (s.intent && INTENTS.includes(s.intent as (typeof INTENTS)[number])) {
    params.push(s.intent);
    where.push(`intent = $${params.length}`);
  }
  return {
    where: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

async function fetchKeywords(s: Search): Promise<KeywordRow[]> {
  const { where, params } = buildWhere(s);
  try {
    const r = await query<KeywordRow>(
      `SELECT id::text,
              phrase,
              intent,
              search_volume,
              difficulty,
              status,
              notes,
              created_at::text
         FROM blog_keywords
         ${where}
         ORDER BY created_at DESC
         LIMIT 200`,
      params,
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function fetchStatusCounts(): Promise<Record<string, number>> {
  try {
    const r = await query<{ status: string; n: string }>(
      `SELECT status, COUNT(*)::text AS n FROM blog_keywords GROUP BY status`,
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.status] = Number(row.n);
    return out;
  } catch {
    return {};
  }
}

export default async function BlogBuilderListPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdmin();
  const s = await searchParams;

  const [rows, counts] = await Promise.all([
    fetchKeywords(s),
    fetchStatusCounts(),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="page admin-page" style={{ maxWidth: 1100 }}>
      <Link href="/admin/blog" className="back-link">
        ← Blog admin
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog · Builder</p>
        <h1>Keyword bank</h1>
        <p className="sub">
          {total} total ·{" "}
          {STATUSES.map((st, i) => (
            <span key={st}>
              {i > 0 && " · "}
              {counts[st] ?? 0} {STATUS_LABELS[st]?.toLowerCase()}
            </span>
          ))}
        </p>
      </header>

      {s.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          {s.added
            ? `Added ${s.added} new keyword${s.added === "1" ? "" : "s"}.`
            : "Saved."}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: "var(--s-3)",
          marginBottom: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <ButtonLink href="/admin/blog/builder/new" variant="primary" icon="plus">
          Add keywords
        </ButtonLink>
      </div>

      <form
        method="get"
        style={{
          display: "flex",
          gap: "var(--s-3)",
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: "var(--s-5)",
          padding: "var(--s-3) var(--s-4)",
          background: "var(--surface-sunken)",
          borderRadius: 10,
          border: "1px solid var(--hairline)",
        }}
      >
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            flex: "1 1 240px",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Search phrase
          </span>
          <Input
            name="q"
            defaultValue={s.q ?? ""}
            placeholder="commuter, range, …"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Status
          </span>
          <select
            name="status"
            className="input"
            defaultValue={s.status ?? ""}
          >
            <option value="">All</option>
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            Intent
          </span>
          <select
            name="intent"
            className="input"
            defaultValue={s.intent ?? ""}
          >
            <option value="">All</option>
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn --dark --sm">
          Filter
        </button>
        {(s.q || s.status || s.intent) && (
          <Link
            href="/admin/blog/builder"
            style={{
              fontSize: "var(--t-body-s)",
              color: "var(--ink-3)",
              textDecoration: "underline",
              alignSelf: "center",
            }}
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>{total === 0 ? "No keywords yet" : "No matches"}</h3>
          <p style={{ margin: 0 }}>
            {total === 0 ? (
              <>
                <Link href="/admin/blog/builder/new">Add your first keyword</Link>{" "}
                to start the bank.
              </>
            ) : (
              "Try a different filter."
            )}
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-2)",
          }}
        >
          {rows.map((k) => (
            <li
              key={k.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto auto",
                gap: "var(--s-3)",
                alignItems: "center",
                padding: "var(--s-3) var(--s-4)",
                background: "#fff",
                border: "1px solid var(--hairline)",
                borderRadius: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--ink-1)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {k.phrase}
                </div>
                {k.notes && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {k.notes}
                  </div>
                )}
              </div>
              <span
                className={`users-tag ${STATUS_TONE[k.status] ?? ""}`}
                title={`Status: ${k.status}`}
              >
                {STATUS_LABELS[k.status] ?? k.status}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  minWidth: 96,
                  textAlign: "right",
                }}
              >
                {k.intent ?? "—"}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  minWidth: 80,
                  textAlign: "right",
                }}
                title="Search volume"
              >
                {k.search_volume != null ? `${k.search_volume}/mo` : "—"}
              </span>
              <Link
                href={`/admin/blog/builder/${k.id}`}
                style={{
                  fontWeight: 600,
                  color: "var(--ink-1)",
                  fontSize: "var(--t-body-s)",
                  textDecoration: "none",
                }}
              >
                Edit →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

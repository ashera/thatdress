import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  clearPexelsImage,
  clearSerpAnalysis,
  deleteBlogKeyword,
  generateClusterFromKeyword,
  refreshPexelsImage,
  runSerpAnalysis,
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
  "no-pexels-key":
    "PEXELS_API_KEY isn't set on the server — add it and redeploy to fetch images.",
  "pexels-error":
    "Pexels returned an error. Check server logs and try again.",
  "no-pexels-results":
    "Pexels has no more landscape photos for this phrase. Try a related keyword.",
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
  serp_analysis_json: SerpAnalysis | null;
  serp_analyzed_at: string | null;
};

type SerpAnalysis = {
  keyword?: string;
  summary?: string;
  top_results?: Array<{
    rank?: number;
    url?: string;
    title?: string;
    domain?: string;
    format?: string;
    estimated_word_count?: number;
    topics_covered?: string[];
  }>;
  average_word_count?: number;
  target_word_count?: string;
  common_topics?: string[];
  missing_topics_to_add?: string[];
  recommended_format?: string;
  format_rationale?: string;
};

type ImageRow = {
  id: string;
  source: string;
  source_id: string;
  url_large: string;
  url_original: string | null;
  source_url: string | null;
  photographer: string | null;
  photographer_url: string | null;
  alt: string | null;
  page_offset: number;
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

  const [keywordRes, clustersRes, imageRes] = await Promise.all([
    query<KeywordRow>(
      `SELECT id::text,
              phrase,
              intent,
              search_volume,
              difficulty,
              notes,
              status,
              created_at::text,
              updated_at::text,
              serp_analysis_json,
              serp_analyzed_at::text
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
    query<ImageRow>(
      `SELECT id::text,
              source,
              source_id,
              url_large,
              url_original,
              source_url,
              photographer,
              photographer_url,
              alt,
              page_offset,
              updated_at::text
         FROM blog_keyword_images
        WHERE keyword_id = $1::bigint
        LIMIT 1`,
      [id],
    ),
  ]);
  const k = keywordRes.rows[0];
  if (!k) notFound();
  const clusters = clustersRes.rows;
  const image = imageRes.rows[0] ?? null;
  const serp = k.serp_analysis_json;

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: "var(--s-3)",
          }}
        >
          <div>
            <h2 className="card-heading" style={{ margin: 0 }}>
              SERP analysis
            </h2>
            <p className="card-sub" style={{ marginTop: 4 }}>
              Search Google, fetch the top 3 organic results, and analyze
              their format, length, and topics.
              {k.serp_analyzed_at
                ? ` Last run ${formatDate(k.serp_analyzed_at)}.`
                : " Not run yet."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <form action={runSerpAnalysis}>
              <input type="hidden" name="keywordId" value={k.id} />
              <Button type="submit" variant={serp ? "ghost" : "primary"}>
                {serp ? "Re-run analysis" : "Run analysis"}
              </Button>
            </form>
            {serp && (
              <form action={clearSerpAnalysis}>
                <input type="hidden" name="keywordId" value={k.id} />
                <Button type="submit" variant="ghost">
                  Clear
                </Button>
              </form>
            )}
          </div>
        </div>

        {serp ? (
          <div
            style={{
              padding: "var(--s-4)",
              background: "var(--surface-sunken)",
              borderRadius: 10,
              border: "1px solid var(--hairline)",
              fontSize: "var(--t-body-s)",
            }}
          >
            {serp.summary && (
              <p style={{ margin: "0 0 var(--s-3)", color: "var(--ink-2)" }}>
                {serp.summary}
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "var(--s-3)",
                marginBottom: "var(--s-4)",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--ink-3)",
                  }}
                >
                  Recommended format
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--ink-1)",
                    textTransform: "capitalize",
                  }}
                >
                  {serp.recommended_format ?? "—"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--ink-3)",
                  }}
                >
                  Target length
                </div>
                <div style={{ fontWeight: 700, color: "var(--ink-1)" }}>
                  {serp.target_word_count ??
                    (serp.average_word_count
                      ? `~${serp.average_word_count} words`
                      : "—")}
                </div>
              </div>
            </div>

            {serp.format_rationale && (
              <p
                style={{
                  margin: "0 0 var(--s-4)",
                  color: "var(--ink-3)",
                  fontStyle: "italic",
                }}
              >
                {serp.format_rationale}
              </p>
            )}

            {Array.isArray(serp.top_results) && serp.top_results.length > 0 && (
              <div style={{ marginBottom: "var(--s-4)" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--ink-3)",
                    marginBottom: 6,
                  }}
                >
                  Top 3 ranking pages
                </div>
                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {serp.top_results.map((r) => (
                    <li key={r.url ?? r.rank} style={{ minWidth: 0 }}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener"
                        style={{
                          color: "var(--ink-1)",
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        {r.title ?? r.url}
                      </a>{" "}
                      <span style={{ color: "var(--ink-3)" }}>
                        ({r.domain ?? "—"})
                      </span>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                        {r.format ?? "—"} ·{" "}
                        {r.estimated_word_count
                          ? `~${r.estimated_word_count} words`
                          : "length unknown"}
                      </div>
                      {r.topics_covered && r.topics_covered.length > 0 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--ink-3)",
                            marginTop: 2,
                          }}
                        >
                          {r.topics_covered.slice(0, 8).join(" · ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {Array.isArray(serp.common_topics) && serp.common_topics.length > 0 && (
              <div style={{ marginBottom: "var(--s-3)" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--ink-3)",
                    marginBottom: 6,
                  }}
                >
                  Topics every top-3 page covers
                </div>
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                >
                  {serp.common_topics.map((t, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "3px 10px",
                        background: "#fff",
                        border: "1px solid var(--hairline)",
                        borderRadius: 999,
                        fontSize: 12,
                        color: "var(--ink-2)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(serp.missing_topics_to_add) &&
              serp.missing_topics_to_add.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--ink-3)",
                      marginBottom: 6,
                    }}
                  >
                    Topics to add (the gap)
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                  >
                    {serp.missing_topics_to_add.map((t, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "3px 10px",
                          background: "var(--volt-100)",
                          border: "1px solid var(--volt-300)",
                          color: "var(--ink-1)",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        + {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ) : (
          <p style={{ color: "var(--ink-3)", margin: 0, fontSize: "var(--t-body-s)" }}>
            Run the analysis to see SERP format, target length, and the
            topics worth covering.
          </p>
        )}
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginBottom: "var(--s-3)",
          }}
        >
          <div>
            <h2 className="card-heading" style={{ margin: 0 }}>
              Hero image
            </h2>
            <p className="card-sub" style={{ marginTop: 4 }}>
              Pulls a landscape photo from Pexels matching this keyword.
              Click <strong>Refresh</strong> to swap for a different one.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <form action={refreshPexelsImage}>
              <input type="hidden" name="keywordId" value={k.id} />
              <Button type="submit" variant={image ? "ghost" : "primary"}>
                {image ? "Refresh" : "Find image"}
              </Button>
            </form>
            {image && (
              <form action={clearPexelsImage}>
                <input type="hidden" name="keywordId" value={k.id} />
                <Button type="submit" variant="ghost">
                  Clear
                </Button>
              </form>
            )}
          </div>
        </div>

        {image ? (
          <figure style={{ margin: 0 }}>
            <img
              src={image.url_large}
              alt={image.alt ?? k.phrase}
              style={{
                width: "100%",
                maxHeight: 320,
                objectFit: "cover",
                borderRadius: 10,
                border: "1px solid var(--hairline)",
                background: "var(--surface-sunken)",
                display: "block",
              }}
            />
            <figcaption
              style={{
                fontSize: 12,
                color: "var(--ink-3)",
                marginTop: 8,
              }}
            >
              Photo by{" "}
              {image.photographer_url ? (
                <a
                  href={image.photographer_url}
                  target="_blank"
                  rel="noopener"
                  style={{ color: "var(--ink-2)" }}
                >
                  {image.photographer}
                </a>
              ) : (
                image.photographer
              )}{" "}
              on{" "}
              {image.source_url ? (
                <a
                  href={image.source_url}
                  target="_blank"
                  rel="noopener"
                  style={{ color: "var(--ink-2)" }}
                >
                  Pexels
                </a>
              ) : (
                "Pexels"
              )}
              .
            </figcaption>
          </figure>
        ) : (
          <p style={{ color: "var(--ink-3)", margin: 0, fontSize: "var(--t-body-s)" }}>
            No image yet — click <strong>Find image</strong> to fetch one.
          </p>
        )}
      </section>

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

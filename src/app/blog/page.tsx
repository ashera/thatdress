import Link from "next/link";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/email";

// Static-rendered with revalidation. Blog admin actions call
// revalidatePath('/blog') on every publish/update/delete/tag change,
// so changes appear within a few seconds for admins. The hour-long
// fallback covers any actions we forget to wire revalidations into.
export const revalidate = 3600;

const PAGE_SIZE = 10;

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image_id: string | null;
  published_at: string;
  author_first_name: string | null;
  author_email: string | null;
  tag_labels: string | null;
  tag_slugs: string | null;
};

type TagRow = { slug: string; label: string; n: number };

async function fetchTags(): Promise<TagRow[]> {
  try {
    const r = await query<{ slug: string; label: string; n: string }>(
      `SELECT t.slug, t.label, COUNT(pt.post_id)::text AS n
         FROM blog_tags t
         LEFT JOIN blog_post_tags pt ON pt.tag_id = t.id
         LEFT JOIN blog_posts p
                ON p.id = pt.post_id
               AND p.published_at IS NOT NULL
               AND p.published_at <= NOW()
        GROUP BY t.id, t.slug, t.label, t.sort_order
       HAVING COUNT(p.id) > 0
        ORDER BY t.sort_order, t.label`,
    );
    return r.rows.map((row) => ({
      slug: row.slug,
      label: row.label,
      n: Number(row.n ?? 0),
    }));
  } catch {
    return [];
  }
}

async function fetchPosts(
  page: number,
): Promise<{ rows: PostRow[]; total: number }> {
  const offset = (page - 1) * PAGE_SIZE;
  try {
    const [postsRes, countRes] = await Promise.all([
      query<PostRow>(
        `SELECT p.id::text,
                p.slug,
                p.title,
                p.excerpt,
                p.hero_image_id::text,
                p.published_at::text,
                u.first_name AS author_first_name,
                u.email      AS author_email,
                (
                  SELECT STRING_AGG(t.label, '|' ORDER BY t.sort_order, t.label)
                    FROM blog_post_tags pt
                    JOIN blog_tags t ON t.id = pt.tag_id
                   WHERE pt.post_id = p.id
                ) AS tag_labels,
                (
                  SELECT STRING_AGG(t.slug, '|' ORDER BY t.sort_order, t.label)
                    FROM blog_post_tags pt
                    JOIN blog_tags t ON t.id = pt.tag_id
                   WHERE pt.post_id = p.id
                ) AS tag_slugs
           FROM blog_posts p
           LEFT JOIN users u ON u.id = p.author_id
          WHERE p.published_at IS NOT NULL
            AND p.published_at <= NOW()
          ORDER BY p.published_at DESC
          LIMIT $1 OFFSET $2`,
        [PAGE_SIZE, offset],
      ),
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM blog_posts
          WHERE published_at IS NOT NULL AND published_at <= NOW()`,
      ),
    ]);
    return {
      rows: postsRes.rows,
      total: Number(countRes.rows[0]?.n ?? 0),
    };
  } catch {
    return { rows: [], total: 0 };
  }
}

function tagPairs(p: PostRow): { slug: string; label: string }[] {
  if (!p.tag_labels || !p.tag_slugs) return [];
  const labels = p.tag_labels.split("|");
  const slugs = p.tag_slugs.split("|");
  return slugs.map((slug, i) => ({ slug, label: labels[i] ?? slug }));
}

function authorLabel(p: PostRow): string {
  if (p.author_first_name && p.author_first_name.trim()) {
    return p.author_first_name.trim();
  }
  if (p.author_email) {
    return p.author_email.split("@")[0] ?? "frockd";
  }
  return "frockd";
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = await getBaseUrl();
  const description =
    "Buying guides, sizing notes, and resale advice for the pre-loved formal-dress market.";
  return {
    title: "frockd blog · formal-dress buying guides & resale advice",
    description,
    alternates: { canonical: `${baseUrl}/blog` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/blog`,
      title: "frockd blog",
      description,
      siteName: "frockd",
    },
  };
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const [{ rows, total }, tags] = await Promise.all([
    fetchPosts(page),
    fetchTags(),
  ]);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 1024, margin: "0 auto" }}>
        <p className="eyebrow">The frockd blog</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1)",
            color: "var(--ink-1)",
            margin: "var(--s-2) 0 var(--s-3)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Stories from the pre-loved formal-dress market
        </h1>
        <p
          style={{
            color: "var(--ink-3)",
            margin: "0 0 var(--s-5)",
            maxWidth: 60 + "ch",
          }}
        >
          Buying guides, sizing notes, and resale advice — written for
          weddings, galas, proms, and the dresses that deserve a second wear.
        </p>

        {tags.length > 0 && (
          <nav
            aria-label="Tags"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: "var(--s-7)",
            }}
          >
            {tags.map((t) => (
              <Link
                key={t.slug}
                href={`/blog/tag/${t.slug}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  border: "1px solid var(--hairline)",
                  borderRadius: 999,
                  background: "#fff",
                  color: "var(--ink-2)",
                  fontSize: "var(--t-body-s)",
                  textDecoration: "none",
                }}
              >
                {t.label}
                <span style={{ color: "var(--ink-4)" }}>{t.n}</span>
              </Link>
            ))}
          </nav>
        )}

        {rows.length === 0 ? (
          <div className="empty-state">
            <h3>No posts yet</h3>
            <p style={{ margin: 0 }}>Check back soon.</p>
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-5)",
            }}
          >
            {rows.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: p.hero_image_id ? "180px 1fr" : "1fr",
                  gap: "var(--s-4)",
                  padding: "var(--s-4)",
                  background: "#fff",
                  border: "1px solid var(--line, #e9e5df)",
                  borderRadius: 12,
                }}
              >
                {p.hero_image_id && (
                  <Link
                    href={`/blog/${p.slug}`}
                    style={{
                      display: "block",
                      borderRadius: 8,
                      overflow: "hidden",
                      aspectRatio: "16 / 10",
                      background: "var(--surface-2, #f7f6f3)",
                    }}
                  >
                    <img
                      src={`/api/blog/posts/${p.id}/hero`}
                      alt={`Hero image for blog post: ${p.title}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </Link>
                )}
                <div style={{ minWidth: 0 }}>
                  <p
                    className="eyebrow"
                    style={{ margin: 0, color: "var(--ink-3)" }}
                  >
                    {formatDate(p.published_at)} · {authorLabel(p)}
                  </p>
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 24,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.15,
                      margin: "var(--s-2) 0",
                      color: "var(--ink-1)",
                    }}
                  >
                    <Link
                      href={`/blog/${p.slug}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {p.title}
                    </Link>
                  </h2>
                  {p.excerpt && (
                    <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
                      {p.excerpt}
                    </p>
                  )}
                  {(() => {
                    const pairs = tagPairs(p);
                    if (pairs.length === 0) return null;
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: "var(--s-3)",
                        }}
                      >
                        {pairs.map((t) => (
                          <Link
                            key={t.slug}
                            href={`/blog/tag/${t.slug}`}
                            style={{
                              display: "inline-block",
                              padding: "2px 10px",
                              borderRadius: 999,
                              background: "var(--surface-sunken)",
                              color: "var(--ink-3)",
                              fontSize: 12,
                              textDecoration: "none",
                            }}
                          >
                            {t.label}
                          </Link>
                        ))}
                      </div>
                    );
                  })()}
                  <p style={{ marginTop: "var(--s-3)", marginBottom: 0 }}>
                    <Link
                      href={`/blog/${p.slug}`}
                      style={{
                        color: "var(--ink-1)",
                        fontWeight: 600,
                        fontSize: "var(--t-body-s)",
                      }}
                    >
                      Read post →
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lastPage > 1 && (
          <nav
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "var(--s-7)",
              fontSize: "var(--t-body-s)",
              color: "var(--ink-2)",
            }}
          >
            {page > 1 ? (
              <Link href={`/blog?page=${page - 1}`}>← Newer posts</Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={`/blog?page=${page + 1}`}>Older posts →</Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type TagRow = { id: string; slug: string; label: string };
type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image_id: string | null;
  published_at: string;
  author_first_name: string | null;
  author_email: string | null;
};

async function fetchTag(slug: string): Promise<TagRow | null> {
  try {
    const r = await query<TagRow>(
      `SELECT id::text, slug, label FROM blog_tags WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchPostsForTag(
  tagId: string,
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
                u.email      AS author_email
           FROM blog_posts p
           JOIN blog_post_tags pt ON pt.post_id = p.id
           LEFT JOIN users u ON u.id = p.author_id
          WHERE pt.tag_id = $1::bigint
            AND p.published_at IS NOT NULL
            AND p.published_at <= NOW()
          ORDER BY p.published_at DESC
          LIMIT $2 OFFSET $3`,
        [tagId, PAGE_SIZE, offset],
      ),
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM blog_posts p
           JOIN blog_post_tags pt ON pt.post_id = p.id
          WHERE pt.tag_id = $1::bigint
            AND p.published_at IS NOT NULL
            AND p.published_at <= NOW()`,
        [tagId],
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tag = await fetchTag(slug);
  if (!tag) return { title: "Tag not found · frockd" };
  const baseUrl = await getBaseUrl();
  const description = `Posts tagged ${tag.label} on the frockd blog.`;
  return {
    title: `${tag.label} · frockd blog`,
    description,
    alternates: { canonical: `${baseUrl}/blog/tag/${tag.slug}` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/blog/tag/${tag.slug}`,
      title: `${tag.label} · frockd blog`,
      description,
      siteName: "frockd",
    },
  };
}

export default async function BlogTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const tag = await fetchTag(slug);
  if (!tag) notFound();

  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
  const { rows, total } = await fetchPostsForTag(tag.id, page);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 1024, margin: "0 auto" }}>
        <Link
          href="/blog"
          style={{
            color: "var(--ink-3)",
            fontSize: "var(--t-body-s)",
            textDecoration: "none",
          }}
        >
          ← All posts
        </Link>

        <p className="eyebrow" style={{ marginTop: "var(--s-4)" }}>
          Tag
        </p>
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
          {tag.label}
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-7)" }}>
          {total === 1 ? "1 post" : `${total} posts`}.
        </p>

        {rows.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing tagged yet</h3>
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
                  border: "1px solid var(--hairline)",
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
                      background: "var(--surface-sunken)",
                    }}
                  >
                    <img
                      src={`/api/blog/posts/${p.id}/hero`}
                      alt=""
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
              <Link href={`/blog/tag/${tag.slug}?page=${page - 1}`}>
                ← Newer posts
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={`/blog/tag/${tag.slug}?page=${page + 1}`}>
                Older posts →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </main>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getBaseUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

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
};

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
                u.email      AS author_email
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

function authorLabel(p: PostRow): string {
  if (p.author_first_name && p.author_first_name.trim()) {
    return p.author_first_name.trim();
  }
  if (p.author_email) {
    return p.author_email.split("@")[0] ?? "ebikeflip";
  }
  return "ebikeflip";
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
    "Buying guides, range tests, and ownership advice for the used eBike market.";
  return {
    title: "ebikeflip blog · used eBike buying guides & advice",
    description,
    alternates: { canonical: `${baseUrl}/blog` },
    openGraph: {
      type: "website",
      url: `${baseUrl}/blog`,
      title: "ebikeflip blog",
      description,
      siteName: "ebikeflip",
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
  const { rows, total } = await fetchPosts(page);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 880, margin: "0 auto" }}>
        <p className="eyebrow">The ebikeflip blog</p>
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
          Stories from the secondhand eBike market
        </h1>
        <p
          style={{
            color: "var(--ink-3)",
            margin: "0 0 var(--s-7)",
            maxWidth: 60 + "ch",
          }}
        >
          Buying guides, range tests, and ownership advice — written for
          riders kicking the tires on a used bike.
        </p>

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

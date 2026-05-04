import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { renderMarkdown, stripMarkdown } from "@/lib/blog";
import { ViewLogger } from "@/app/_components/view-logger";

export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  hero_image_id: string | null;
  published_at: string | null;
  updated_at: string;
  author_first_name: string | null;
  author_email: string | null;
};

type TagRow = { slug: string; label: string };

async function fetchTagsForPost(postId: string): Promise<TagRow[]> {
  try {
    const r = await query<TagRow>(
      `SELECT t.slug, t.label
         FROM blog_post_tags pt
         JOIN blog_tags t ON t.id = pt.tag_id
        WHERE pt.post_id = $1::bigint
        ORDER BY t.sort_order, t.label`,
      [postId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function fetchPost(slug: string): Promise<PostRow | null> {
  try {
    const r = await query<PostRow>(
      `SELECT p.id::text,
              p.slug,
              p.title,
              p.excerpt,
              p.body_md,
              p.hero_image_id::text,
              p.published_at::text,
              p.updated_at::text,
              u.first_name AS author_first_name,
              u.email      AS author_email
         FROM blog_posts p
         LEFT JOIN users u ON u.id = p.author_id
        WHERE p.slug = $1
        LIMIT 1`,
      [slug],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
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
  const post = await fetchPost(slug);
  if (!post || !post.published_at) {
    return { title: "Post not found · frockd" };
  }
  const baseUrl = await getBaseUrl();
  const description = post.excerpt ?? stripMarkdown(post.body_md, 160);
  const url = `${baseUrl}/blog/${post.slug}`;

  // og:image and twitter:image are populated automatically from the
  // opengraph-image.tsx convention in this folder — no need to set them
  // here (and doing so would stack two images on the post).
  return {
    title: `${post.title} · frockd blog`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description,
      siteName: "frockd",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [post, user] = await Promise.all([fetchPost(slug), getCurrentUser()]);
  if (!post) notFound();
  const tags = await fetchTagsForPost(post.id);

  const isAdmin = user?.isAdmin ?? false;
  const isLive =
    post.published_at != null &&
    new Date(post.published_at).getTime() <= Date.now();
  if (!isLive && !isAdmin) notFound();

  const html = renderMarkdown(post.body_md);
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/blog/${post.slug}`;
  const description = post.excerpt ?? stripMarkdown(post.body_md, 160);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      "@type": "Person",
      name: authorLabel(post),
    },
    publisher: {
      "@type": "Organization",
      name: "frockd",
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: post.hero_image_id
      ? `${baseUrl}/api/blog/posts/${post.id}/hero`
      : undefined,
  };

  return (
    <div className="page page--pad">
      <article style={{ maxWidth: 1024, margin: "0 auto" }}>
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

        {!isLive && isAdmin && (
          <p
            className="form-error"
            style={{ marginTop: "var(--s-4)", marginBottom: 0 }}
          >
            {post.published_at
              ? `Scheduled — goes live ${formatDate(post.published_at)}. Only admins see this preview.`
              : "Draft — only admins see this. Publish from the admin console."}
          </p>
        )}

        <header
          className={`blog-banner ${post.hero_image_id ? "has-image" : ""}`}
        >
          {post.hero_image_id && (
            <img
              className="blog-banner-img"
              src={`/api/blog/posts/${post.id}/hero`}
              alt=""
            />
          )}
          <div className="blog-banner-scrim" aria-hidden />
          <div className="blog-banner-content">
            <p className="blog-banner-eyebrow">
              {post.published_at
                ? `${formatDate(post.published_at)} · ${authorLabel(post)}`
                : `Draft · ${authorLabel(post)}`}
            </p>
            <h1 className="blog-banner-title">{post.title}</h1>
            {post.excerpt && (
              <p className="blog-banner-excerpt">{post.excerpt}</p>
            )}
          </div>
        </header>

        {tags.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              margin: "0 0 var(--s-8)",
            }}
          >
            <span
              style={{
                color: "var(--ink-3)",
                fontSize: "var(--t-body-s)",
                marginRight: 4,
                alignSelf: "center",
              }}
            >
              Filed under
            </span>
            {tags.map((t) => (
              <Link
                key={t.slug}
                href={`/blog/tag/${t.slug}`}
                style={{
                  display: "inline-block",
                  padding: "4px 12px",
                  borderRadius: 999,
                  background: "var(--surface-sunken)",
                  color: "var(--ink-2)",
                  fontSize: "var(--t-body-s)",
                  textDecoration: "none",
                }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}

        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </article>
      {isLive && <ViewLogger postId={post.id} />}
    </div>
  );
}

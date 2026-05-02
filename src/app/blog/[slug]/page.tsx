import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import { renderMarkdown, stripMarkdown } from "@/lib/blog";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post || !post.published_at) {
    return { title: "Post not found · ebikeflip" };
  }
  const baseUrl = await getBaseUrl();
  const description = post.excerpt ?? stripMarkdown(post.body_md, 160);
  const url = `${baseUrl}/blog/${post.slug}`;
  const ogImage = post.hero_image_id
    ? `${baseUrl}/api/blog/posts/${post.id}/hero`
    : undefined;

  return {
    title: `${post.title} · ebikeflip blog`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description,
      siteName: "ebikeflip",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: ogImage ? [ogImage] : undefined,
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
      name: "ebikeflip",
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: post.hero_image_id
      ? `${baseUrl}/api/blog/posts/${post.id}/hero`
      : undefined,
  };

  return (
    <div className="page page--pad">
      <article style={{ maxWidth: 720, margin: "0 auto" }}>
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

        <header style={{ margin: "var(--s-5) 0 var(--s-7)" }}>
          <p className="eyebrow" style={{ margin: 0, color: "var(--ink-3)" }}>
            {post.published_at
              ? `${formatDate(post.published_at)} · ${authorLabel(post)}`
              : `Draft · ${authorLabel(post)}`}
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
            {post.title}
          </h1>
          {post.excerpt && (
            <p
              style={{
                color: "var(--ink-2)",
                fontSize: 18,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {post.excerpt}
            </p>
          )}
        </header>

        {post.hero_image_id && (
          <img
            src={`/api/blog/posts/${post.id}/hero`}
            alt=""
            style={{
              width: "100%",
              borderRadius: 12,
              display: "block",
              marginBottom: "var(--s-7)",
            }}
          />
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
    </div>
  );
}

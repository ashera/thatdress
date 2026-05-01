import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  clearBlogHero,
  deleteBlogPost,
  toggleBlogPublished,
  updateBlogPost,
} from "@/lib/actions/blog";
import { Button, Field, Input, Textarea } from "../../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required.",
  "invalid-slug": "Slug must be lowercase letters, numbers, and dashes only.",
};

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  hero_image_id: string | null;
  published_at: string | null;
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

export default async function EditBlogPostPage({
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

  const r = await query<PostRow>(
    `SELECT id::text,
            slug,
            title,
            excerpt,
            body_md,
            hero_image_id::text,
            published_at::text,
            created_at::text,
            updated_at::text
       FROM blog_posts WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const post = r.rows[0];
  if (!post) notFound();

  const isPublished = !!post.published_at;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/blog" className="back-link">
        ← All posts
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog</p>
        <h1>{post.title}</h1>
        <p className="sub">
          {isPublished ? (
            <>
              <span className="users-tag --ok">Published</span>{" "}
              {formatDate(post.published_at)} ·{" "}
              <Link href={`/blog/${post.slug}`}>View on site</Link>
            </>
          ) : (
            <>
              <span className="users-tag --susp">Draft</span> Last edited{" "}
              {formatDate(post.updated_at)}
            </>
          )}
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

      <section
        className="form-card"
        style={{
          marginBottom: "var(--s-5)",
          display: "flex",
          gap: "var(--s-3)",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2 className="card-heading" style={{ margin: 0 }}>
            {isPublished ? "Currently live" : "Not yet published"}
          </h2>
          <p className="card-sub" style={{ marginTop: 4 }}>
            {isPublished
              ? "Toggle off to take it down without losing the content."
              : "Toggle on when you're ready for readers and search."}
          </p>
        </div>
        <form action={toggleBlogPublished}>
          <input type="hidden" name="postId" value={post.id} />
          <Button type="submit" variant={isPublished ? "ghost" : "primary"}>
            {isPublished ? "Unpublish" : "Publish now"}
          </Button>
        </form>
      </section>

      <form
        action={updateBlogPost}
        encType="multipart/form-data"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-5)",
        }}
      >
        <input type="hidden" name="postId" value={post.id} />

        <section className="form-card">
          <h2 className="card-heading">The basics</h2>
          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={post.title}
            />
          </Field>
          <Field
            label="Slug"
            htmlFor="slug"
            help="Lowercase letters, numbers, dashes only. Changing it breaks any existing links."
          >
            <Input
              id="slug"
              name="slug"
              maxLength={80}
              defaultValue={post.slug}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
          </Field>
          <Field
            label="Excerpt"
            htmlFor="excerpt"
            help="Shown in list cards and used as the meta description."
          >
            <Textarea
              id="excerpt"
              name="excerpt"
              rows={3}
              maxLength={320}
              defaultValue={post.excerpt ?? ""}
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Hero image</h2>
          <p className="card-sub">
            JPEG, PNG, or WebP · 5 MB or smaller. Uploading replaces any
            existing hero.
          </p>
          {post.hero_image_id && (
            <div style={{ marginBottom: "var(--s-4)" }}>
              <img
                src={`/api/blog/posts/${post.id}/hero`}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 280,
                  objectFit: "cover",
                  borderRadius: 10,
                  marginBottom: "var(--s-3)",
                }}
              />
            </div>
          )}
          <Field
            label={post.hero_image_id ? "Replace hero" : "Add hero"}
            htmlFor="hero"
          >
            <input
              id="hero"
              type="file"
              name="hero"
              accept="image/jpeg,image/png,image/webp"
              className="file-input"
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Body</h2>
          <p className="card-sub">
            Markdown supported: headings, lists, links, images, code blocks,
            blockquotes.
          </p>
          <Field label="Markdown" htmlFor="body_md">
            <Textarea
              id="body_md"
              name="body_md"
              rows={20}
              maxLength={100000}
              defaultValue={post.body_md}
              style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
            />
          </Field>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" iconRight="arrow">
            Save changes
          </Button>
        </div>
      </form>

      {post.hero_image_id && (
        <form
          action={clearBlogHero}
          style={{
            marginTop: "var(--s-5)",
            paddingTop: "var(--s-4)",
            borderTop: "1px solid var(--hairline)",
            textAlign: "center",
          }}
        >
          <input type="hidden" name="postId" value={post.id} />
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
            Remove hero image
          </button>
        </form>
      )}

      <form
        action={deleteBlogPost}
        style={{
          marginTop: "var(--s-7)",
          paddingTop: "var(--s-5)",
          borderTop: "1px solid var(--hairline)",
          textAlign: "center",
        }}
      >
        <input type="hidden" name="postId" value={post.id} />
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
          Delete this post permanently
        </button>
      </form>
    </div>
  );
}

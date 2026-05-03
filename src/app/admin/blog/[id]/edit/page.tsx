import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  clearBlogHero,
  deleteBlogPost,
  setBlogPostTags,
  setBlogPublishedAt,
  toggleBlogPublished,
  updateBlogPost,
} from "@/lib/actions/blog";
import { Button, Field, Input, Textarea } from "../../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required.",
  "invalid-slug": "Slug must be lowercase letters, numbers, and dashes only.",
  "invalid-date": "That doesn't look like a valid date and time.",
};

function toDatetimeLocal(s: string | null): string {
  if (!s) return "";
  // Trim seconds + tz so <input type="datetime-local"> accepts it.
  // Postgres TIMESTAMPTZ::text gives e.g. "2026-05-09 13:30:00+00".
  // Convert to "YYYY-MM-DDTHH:mm" in local time.
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  } catch {
    return "";
  }
}

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

  const [postRes, tagsRes, assignedRes] = await Promise.all([
    query<PostRow>(
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
    ),
    query<{ id: string; label: string }>(
      `SELECT id::text, label FROM blog_tags ORDER BY sort_order, label`,
    ),
    query<{ tag_id: string }>(
      `SELECT tag_id::text FROM blog_post_tags WHERE post_id = $1::bigint`,
      [id],
    ),
  ]);
  const post = postRes.rows[0];
  if (!post) notFound();
  const allTags = tagsRes.rows;
  const assigned = new Set(assignedRes.rows.map((r) => r.tag_id));

  const isPublished = !!post.published_at;
  const isScheduled =
    isPublished &&
    post.published_at != null &&
    new Date(post.published_at).getTime() > Date.now();

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/blog" className="back-link">
        ← All posts
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog</p>
        <h1>{post.title}</h1>
        <p className="sub">
          {isScheduled ? (
            <>
              <span className="users-tag --susp">Scheduled</span> Goes live{" "}
              {formatDate(post.published_at)}
            </>
          ) : isPublished ? (
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
        style={{ marginBottom: "var(--s-5)" }}
      >
        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--s-4)",
          }}
        >
          <div>
            <h2 className="card-heading" style={{ margin: 0 }}>
              {isScheduled
                ? "Scheduled"
                : isPublished
                ? "Currently live"
                : "Not yet published"}
            </h2>
            <p className="card-sub" style={{ marginTop: 4 }}>
              {isScheduled
                ? "Will appear automatically once the publish time passes."
                : isPublished
                ? "Toggle off to take it down without losing the content."
                : "Toggle on when you're ready for readers and search."}
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener"
              className="btn --ghost"
              title={
                isPublished
                  ? "Open the live post in a new tab"
                  : "Open the draft preview in a new tab (admin-only view)"
              }
            >
              Preview ↗
            </Link>
            <form action={toggleBlogPublished}>
              <input type="hidden" name="postId" value={post.id} />
              <Button type="submit" variant={isPublished ? "ghost" : "primary"}>
                {isPublished ? "Unpublish" : "Publish now"}
              </Button>
            </form>
          </div>
        </div>

        <form
          action={setBlogPublishedAt}
          style={{
            display: "flex",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            alignItems: "flex-end",
            paddingTop: "var(--s-3)",
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <input type="hidden" name="postId" value={post.id} />
          <Field
            label="Or schedule for a specific time"
            htmlFor="published_at"
          >
            <Input
              id="published_at"
              name="published_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(post.published_at)}
            />
          </Field>
          <Button type="submit" variant="dark">
            Save schedule
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

      <form
        action={setBlogPostTags}
        style={{ marginTop: "var(--s-5)" }}
      >
        <input type="hidden" name="postId" value={post.id} />
        <section className="form-card">
          <h2 className="card-heading">Tags</h2>
          <p className="card-sub">
            Pick a few — they group related posts and create extra
            indexable landing pages at /blog/tag/[slug].{" "}
            <Link href="/admin/blog/tags">Manage tag list</Link>.
          </p>
          {allTags.length === 0 ? (
            <p style={{ color: "var(--ink-3)", margin: 0 }}>
              No tags exist yet — add some in <Link href="/admin/blog/tags">Manage tags</Link> first.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--s-2)",
              }}
            >
              {allTags.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    border: "1px solid var(--hairline)",
                    borderRadius: 999,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "var(--t-body-s)",
                    color: "var(--ink-2)",
                  }}
                >
                  <input
                    type="checkbox"
                    name="tag_ids"
                    value={t.id}
                    defaultChecked={assigned.has(t.id)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "var(--s-3)",
            }}
          >
            <Button type="submit" variant="dark">
              Save tags
            </Button>
          </div>
        </section>
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

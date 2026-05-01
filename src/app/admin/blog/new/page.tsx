import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createBlogPost } from "@/lib/actions/blog";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required.",
  "invalid-slug": "Slug must be lowercase letters, numbers, and dashes only.",
};

export default async function NewBlogPostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const message = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/blog" className="back-link">
        ← All posts
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog</p>
        <h1>New post</h1>
        <p className="sub">
          Save a draft now, publish when ready. Markdown is supported in the
          body.
        </p>
      </header>

      {message && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {message}
        </p>
      )}

      <form
        action={createBlogPost}
        encType="multipart/form-data"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-5)",
        }}
      >
        <section className="form-card">
          <h2 className="card-heading">The basics</h2>
          <Field label="Title" htmlFor="title">
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              placeholder="What's this post about?"
            />
          </Field>
          <Field
            label="Slug (optional)"
            htmlFor="slug"
            help="Defaults to the slugified title. Lowercase letters, numbers, dashes only."
          >
            <Input
              id="slug"
              name="slug"
              maxLength={80}
              placeholder="leave-blank-to-auto-generate"
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
          </Field>
          <Field
            label="Excerpt (optional)"
            htmlFor="excerpt"
            help="Shown in list cards and used as the meta description."
          >
            <Textarea
              id="excerpt"
              name="excerpt"
              rows={3}
              maxLength={320}
              placeholder="One or two sentences."
            />
          </Field>
          <Field label="Hero image (optional)" htmlFor="hero">
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
              rows={18}
              maxLength={100000}
              placeholder={"## A heading\n\nA paragraph of body text…"}
              style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
            />
          </Field>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" variant="primary" iconRight="arrow">
            Save draft
          </Button>
        </div>
      </form>
    </div>
  );
}

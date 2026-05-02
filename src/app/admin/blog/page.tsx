import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ButtonLink } from "../../_components/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  updated_at: string;
  hero_image_id: string | null;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
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

export default async function AdminBlogIndexPage() {
  await requireAdmin();

  const r = await query<Row>(
    `SELECT id::text,
            slug,
            title,
            published_at::text,
            updated_at::text,
            hero_image_id::text
       FROM blog_posts
      ORDER BY COALESCE(published_at, created_at) DESC`,
  );
  const rows = r.rows;
  const drafts = rows.filter((r) => r.published_at == null).length;
  const published = rows.length - drafts;

  return (
    <div className="page admin-page" style={{ maxWidth: 960 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Blog</p>
        <h1>Blog</h1>
        <p className="sub">
          {rows.length} total · {published} published · {drafts} drafts
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: "var(--s-3)",
          marginBottom: "var(--s-5)",
        }}
      >
        <ButtonLink href="/admin/blog/new" variant="primary" icon="plus">
          New post
        </ButtonLink>
        <ButtonLink href="/admin/blog/tags" variant="ghost">
          Manage tags
        </ButtonLink>
        <ButtonLink href="/admin/blog/builder" variant="ghost">
          Blog Builder
        </ButtonLink>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No posts yet</h3>
          <p style={{ margin: 0 }}>
            <Link href="/admin/blog/new">Write your first post</Link>.
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
            gap: "var(--s-3)",
          }}
        >
          {rows.map((p) => (
            <li
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: p.hero_image_id ? "80px 1fr auto" : "1fr auto",
                gap: "var(--s-3)",
                alignItems: "center",
                padding: "var(--s-3)",
                background: "#fff",
                border: "1px solid var(--hairline)",
                borderRadius: 10,
              }}
            >
              {p.hero_image_id && (
                <img
                  src={`/api/blog/posts/${p.id}/hero`}
                  alt=""
                  style={{
                    width: 80,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: 6,
                    background: "var(--surface-sunken)",
                  }}
                />
              )}
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
                  {p.title}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {p.published_at ? (
                    <>
                      <span className="users-tag --ok">Published</span>{" "}
                      {formatDate(p.published_at)} · /blog/{p.slug}
                    </>
                  ) : (
                    <>
                      <span className="users-tag --susp">Draft</span>{" "}
                      Updated {formatDate(p.updated_at)}
                    </>
                  )}
                </div>
              </div>
              <Link
                href={`/admin/blog/${p.id}/edit`}
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

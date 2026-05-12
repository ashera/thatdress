import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  deleteBacklink,
  setBacklinkStatus,
  updateBacklink,
} from "@/lib/actions/admin-backlinks";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit backlink — Admin" };

const STATUS_OPTIONS = [
  { value: "alive", label: "Alive" },
  { value: "pending", label: "Pending" },
  { value: "dead", label: "Dead" },
  { value: "removed", label: "Removed" },
];

const LINK_TYPE_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "dofollow", label: "Dofollow" },
  { value: "nofollow", label: "Nofollow" },
  { value: "sponsored", label: "Sponsored" },
  { value: "ugc", label: "UGC" },
];

const SOURCE_KIND_OPTIONS = [
  { value: "other", label: "Other" },
  { value: "editorial", label: "Editorial" },
  { value: "directory", label: "Directory" },
  { value: "forum", label: "Forum" },
  { value: "social", label: "Social" },
  { value: "blog-post", label: "Blog post" },
  { value: "press", label: "Press" },
  { value: "partner", label: "Partner" },
  { value: "review", label: "Review" },
];

const ERROR: Record<string, string> = {
  "missing-url": "Source URL and target URL are both required.",
  "bad-source-url": "Source URL doesn't parse as a valid URL.",
  "bad-target-url": "Target URL doesn't parse as a valid URL.",
};

type BacklinkRow = {
  id: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  target_url: string;
  anchor_text: string | null;
  status: string;
  link_type: string;
  source_kind: string;
  notes: string | null;
  discovered_at: string;
  last_checked_at: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
};

function formatDateTime(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-AU", {
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

export default async function AdminBacklinkEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const r = await query<BacklinkRow>(
    `SELECT b.id::text,
            b.source_url,
            b.source_domain,
            b.source_title,
            b.target_url,
            b.anchor_text,
            b.status,
            b.link_type,
            b.source_kind,
            b.notes,
            b.discovered_at::text   AS discovered_at,
            b.last_checked_at::text AS last_checked_at,
            b.created_by_user_id::text AS created_by_user_id,
            u.email                  AS created_by_email
       FROM backlinks b
       LEFT JOIN users u ON u.id = b.created_by_user_id
      WHERE b.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) notFound();

  const errMsg = sp.error ? ERROR[sp.error] : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin/links" className="back-link">
        ← Link manager
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Link manager · Edit</p>
        <h1 style={{ wordBreak: "break-word" }}>
          {row.source_title ?? row.source_domain}
        </h1>
        <p className="sub">
          <a
            href={row.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--ink-2)",
              textDecoration: "underline",
              wordBreak: "break-all",
            }}
          >
            {row.source_url}
          </a>
        </p>
      </header>

      {errMsg && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errMsg}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Metadata
        </h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            columnGap: "var(--s-4)",
            rowGap: 6,
            margin: 0,
            fontSize: 14,
          }}
        >
          <DtKey>Discovered</DtKey>
          <dd style={{ margin: 0 }}>{formatDateTime(row.discovered_at)}</dd>
          <DtKey>Last checked</DtKey>
          <dd style={{ margin: 0 }}>{formatDateTime(row.last_checked_at)}</dd>
          <DtKey>Added by</DtKey>
          <dd style={{ margin: 0 }}>
            {row.created_by_user_id && row.created_by_email ? (
              <Link
                href={`/admin/users/${row.created_by_user_id}`}
                style={{
                  color: "var(--ink-1)",
                  textDecoration: "underline",
                }}
              >
                {row.created_by_email}
              </Link>
            ) : (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            )}
          </dd>
          <DtKey>Domain</DtKey>
          <dd
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
            }}
          >
            {row.source_domain}
          </dd>
        </dl>
        <div style={{ marginTop: "var(--s-4)", display: "flex", gap: 8 }}>
          <form action={setBacklinkStatus}>
            <input type="hidden" name="id" value={row.id} />
            <input
              type="hidden"
              name="next_status"
              value={row.status === "alive" ? "dead" : "alive"}
            />
            <Button
              type="submit"
              variant={row.status === "alive" ? "ghost" : "primary"}
              size="sm"
            >
              {row.status === "alive" ? "Mark dead" : "Mark alive"}
            </Button>
          </form>
        </div>
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Edit details
        </h2>
        <form
          action={updateBacklink}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <input type="hidden" name="id" value={row.id} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--s-3)",
            }}
          >
            <Field label="Source URL (external page)" htmlFor="source_url">
              <Input
                id="source_url"
                name="source_url"
                type="url"
                required
                defaultValue={row.source_url}
              />
            </Field>
            <Field label="Target URL (frockd page)" htmlFor="target_url">
              <Input
                id="target_url"
                name="target_url"
                type="url"
                required
                defaultValue={row.target_url}
              />
            </Field>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "var(--s-3)",
            }}
          >
            <Field label="Source page title" htmlFor="source_title">
              <Input
                id="source_title"
                name="source_title"
                type="text"
                maxLength={200}
                defaultValue={row.source_title ?? ""}
              />
            </Field>
            <Field label="Anchor text" htmlFor="anchor_text">
              <Input
                id="anchor_text"
                name="anchor_text"
                type="text"
                maxLength={200}
                defaultValue={row.anchor_text ?? ""}
              />
            </Field>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "var(--s-3)",
            }}
          >
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                className="input"
                defaultValue={row.status}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Link type" htmlFor="link_type">
              <select
                id="link_type"
                name="link_type"
                className="input"
                defaultValue={row.link_type}
              >
                {LINK_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source kind" htmlFor="source_kind">
              <select
                id="source_kind"
                name="source_kind"
                className="input"
                defaultValue={row.source_kind}
              >
                {SOURCE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={row.notes ?? ""}
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Danger zone
        </h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Deleting removes the row entirely. If a backlink is just
          gone, prefer marking it <strong>dead</strong> so the audit
          trail stays.
        </p>
        <form action={deleteBacklink}>
          <input type="hidden" name="id" value={row.id} />
          <Button type="submit" variant="dark" size="sm">
            Delete this row
          </Button>
        </form>
      </section>
    </div>
  );
}

function DtKey({ children }: { children: React.ReactNode }) {
  return (
    <dt
      style={{
        color: "var(--ink-3)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </dt>
  );
}

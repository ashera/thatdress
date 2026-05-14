import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { createBacklink, setBacklinkStatus } from "@/lib/actions/admin-backlinks";
import { Button, Field, Input, Textarea } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Link manager — Admin" };

const STATUS_OPTIONS = [
  { value: "alive", label: "Alive" },
  { value: "pending", label: "Pending" },
  { value: "dead", label: "Dead" },
  { value: "removed", label: "Removed" },
] as const;

const LINK_TYPE_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "dofollow", label: "Dofollow" },
  { value: "nofollow", label: "Nofollow" },
  { value: "sponsored", label: "Sponsored" },
  { value: "ugc", label: "UGC" },
] as const;

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
] as const;

const STATUS_PILL: Record<
  string,
  { bg: string; fg: string; border: string }
> = {
  alive: { bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  pending: { bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  dead: { bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
  removed: { bg: "#e5e7eb", fg: "#374151", border: "#d1d5db" },
};

const FLASH: Record<string, { ok: boolean; text: string }> = {
  created: { ok: true, text: "Backlink added." },
  updated: { ok: true, text: "Backlink updated." },
  deleted: { ok: true, text: "Backlink removed." },
  status: { ok: true, text: "Status updated." },
};

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
  discovered_at: string;
  last_checked_at: string | null;
};

type Summary = {
  total: number;
  alive: number;
  pending: number;
  dead: number;
  domains: number;
};

async function loadSummary(): Promise<Summary> {
  try {
    const r = await query<{
      total: string;
      alive: string;
      pending: string;
      dead: string;
      domains: string;
    }>(
      `SELECT COUNT(*)::text                                       AS total,
              COUNT(*) FILTER (WHERE status = 'alive')::text       AS alive,
              COUNT(*) FILTER (WHERE status = 'pending')::text     AS pending,
              COUNT(*) FILTER (WHERE status = 'dead')::text        AS dead,
              COUNT(DISTINCT source_domain)::text                  AS domains
         FROM backlinks`,
    );
    const row = r.rows[0];
    return {
      total: Number(row?.total ?? 0),
      alive: Number(row?.alive ?? 0),
      pending: Number(row?.pending ?? 0),
      dead: Number(row?.dead ?? 0),
      domains: Number(row?.domains ?? 0),
    };
  } catch {
    return { total: 0, alive: 0, pending: 0, dead: 0, domains: 0 };
  }
}

async function loadBacklinks(): Promise<BacklinkRow[]> {
  try {
    const r = await query<BacklinkRow>(
      `SELECT id::text,
              source_url,
              source_domain,
              source_title,
              target_url,
              anchor_text,
              status,
              link_type,
              source_kind,
              discovered_at::text          AS discovered_at,
              last_checked_at::text        AS last_checked_at
         FROM backlinks
        ORDER BY status = 'alive' DESC,
                 discovered_at DESC
        LIMIT 500`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function targetPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    return url;
  }
}

export default async function AdminLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const [summary, rows] = await Promise.all([
    loadSummary(),
    loadBacklinks(),
  ]);

  const flash = sp.saved ? FLASH[sp.saved] : null;
  const errMsg = sp.error ? ERROR[sp.error] : null;

  return (
    <div className="page admin-page">
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Link manager</p>
        <h1>Inbound link ledger</h1>
        <p className="sub">
          Every external page we know of that links back to frockd —
          where it lives, what it points to, whether it&rsquo;s still
          up. Add new links manually below; automated link checking
          and discovery jobs will plug into this table later.
        </p>
        <div
          style={{
            marginTop: "var(--s-4)",
            display: "flex",
            gap: "var(--s-2)",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/admin/links/pinterest"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              background: "#E60023",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>📌</span>
            Pin a listing to Pinterest
          </Link>
          <Link
            href="/admin/links/instagram"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 999,
              background:
                "linear-gradient(135deg, #f58529 0%, #dd2a7b 45%, #8134af 85%, #515bd4 100%)",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>📸</span>
            Post a listing to Instagram
          </Link>
        </div>
      </header>

      {flash && (
        <p
          className={flash.ok ? "form-success" : "form-error"}
          style={{ marginBottom: "var(--s-5)" }}
        >
          {flash.text}
        </p>
      )}
      {errMsg && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errMsg}
        </p>
      )}

      <section
        className="form-card"
        style={{
          marginBottom: "var(--s-5)",
          background: "#eff6ff",
          borderColor: "#bfdbfe",
        }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Coverage
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--s-3)",
            marginTop: "var(--s-3)",
          }}
        >
          <Tile label="Total links" value={summary.total} />
          <Tile label="Alive" value={summary.alive} tone="good" />
          <Tile label="Pending" value={summary.pending} tone="warn" />
          <Tile label="Dead" value={summary.dead} tone={summary.dead > 0 ? "bad" : undefined} />
          <Tile label="Unique domains" value={summary.domains} />
        </div>
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Add a link
        </h2>
        <p className="card-sub" style={{ marginTop: 0 }}>
          Source URL is the external page; target URL is the frockd
          page it points to. The source&rsquo;s domain is derived
          automatically.
        </p>
        <form
          action={createBacklink}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
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
                placeholder="https://example.com.au/best-pre-loved-dresses"
              />
            </Field>
            <Field label="Target URL (frockd page)" htmlFor="target_url">
              <Input
                id="target_url"
                name="target_url"
                type="url"
                required
                placeholder="https://www.frockd.com.au/tools"
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
                placeholder="Best places to sell formal dresses in Australia"
              />
            </Field>
            <Field label="Anchor text" htmlFor="anchor_text">
              <Input
                id="anchor_text"
                name="anchor_text"
                type="text"
                maxLength={200}
                placeholder="frockd's value estimator"
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
                defaultValue="alive"
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
                defaultValue="unknown"
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
                defaultValue="other"
              >
                {SOURCE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="notes">
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={2000}
              placeholder="Outreach contact, campaign, anything worth remembering."
            />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Save link
            </Button>
          </div>
        </form>
      </section>

      <section>
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--s-3)",
            marginBottom: "var(--s-3)",
          }}
        >
          <h2 className="card-heading" style={{ margin: 0 }}>
            All inbound links
          </h2>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {rows.length} {rows.length === 1 ? "row" : "rows"}
          </span>
        </header>
        {rows.length === 0 ? (
          <div className="empty-state">
            <h3>No links logged yet</h3>
            <p style={{ margin: 0 }}>
              Add your first inbound link with the form above — every
              backlink you earn through outreach, directory listings,
              or press should land here.
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
            {rows.map((row) => {
              const pill = STATUS_PILL[row.status] ?? STATUS_PILL.removed!;
              const isAlive = row.status === "alive";
              return (
                <li
                  key={row.id}
                  className="form-card"
                  style={{ padding: "var(--s-4)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "var(--s-3)",
                      flexWrap: "wrap",
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: pill.bg,
                        color: pill.fg,
                        border: `1px solid ${pill.border}`,
                      }}
                    >
                      {row.status}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                      }}
                    >
                      {row.source_kind} · {row.link_type}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-4)",
                      }}
                    >
                      Added {formatDate(row.discovered_at)}
                      {row.last_checked_at
                        ? ` · checked ${formatDate(row.last_checked_at)}`
                        : ""}
                    </span>
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <a
                      href={row.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--ink-1)",
                        fontWeight: 700,
                        fontSize: 15,
                        textDecoration: "none",
                        wordBreak: "break-word",
                      }}
                    >
                      {row.source_title ?? row.source_domain}
                      <span
                        style={{
                          color: "var(--ink-4)",
                          fontWeight: 400,
                          marginLeft: 6,
                          fontSize: 13,
                        }}
                      >
                        ↗ {row.source_domain}
                      </span>
                    </a>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink-3)",
                      marginBottom: row.anchor_text ? 4 : 0,
                    }}
                  >
                    Points to{" "}
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        background: "var(--surface-sunken)",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {targetPath(row.target_url)}
                    </code>
                  </div>
                  {row.anchor_text && (
                    <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                      Anchor:{" "}
                      <em style={{ color: "var(--ink-2)" }}>
                        “{row.anchor_text}”
                      </em>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: "var(--s-3)",
                      flexWrap: "wrap",
                    }}
                  >
                    <form action={setBacklinkStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <input
                        type="hidden"
                        name="next_status"
                        value={isAlive ? "dead" : "alive"}
                      />
                      <Button
                        type="submit"
                        variant={isAlive ? "ghost" : "primary"}
                        size="sm"
                        title={
                          isAlive
                            ? "Mark as dead — the external page no longer links to us"
                            : "Mark as alive — confirmed the link is still up"
                        }
                      >
                        {isAlive ? "Mark dead" : "Mark alive"}
                      </Button>
                    </form>
                    <Link
                      href={`/admin/links/${row.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 14px",
                        borderRadius: 999,
                        border: "1px solid var(--hairline-strong)",
                        color: "var(--ink-1)",
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "bad";
}) {
  const palette =
    tone === "good"
      ? { bg: "#ecfdf5", border: "#a7f3d0", fg: "#065f46" }
      : tone === "warn"
        ? { bg: "#fef3c7", border: "#fcd34d", fg: "#78350f" }
        : tone === "bad"
          ? { bg: "#fee2e2", border: "#fca5a5", fg: "#991b1b" }
          : {
              bg: "var(--surface)",
              border: "var(--hairline)",
              fg: "var(--ink-1)",
            };
  return (
    <div
      style={{
        padding: "var(--s-3) var(--s-4)",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: palette.fg,
          opacity: 0.8,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: palette.fg,
          lineHeight: 1,
        }}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

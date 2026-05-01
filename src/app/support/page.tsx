import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createTicket } from "@/lib/actions/support";
import { Button, Field, Input, Textarea } from "../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "missing-subject": "Add a subject so we know what the issue is about.",
  "missing-body": "Describe the issue in the message field.",
};

type Row = {
  id: string;
  subject: string;
  status: string;
  updated_at: string;
  msg_count: string;
};

function formatRel(s: string): string {
  const d = new Date(s);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/support");

  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const result = await query<Row>(
    `SELECT t.id::text,
            t.subject,
            t.status,
            t.updated_at::text,
            (SELECT COUNT(*)::text FROM support_messages
              WHERE ticket_id = t.id) AS msg_count
       FROM support_tickets t
      WHERE t.user_id = $1::bigint
      ORDER BY t.updated_at DESC`,
    [user.id],
  );

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <header className="messages-header">
          <p className="eyebrow">Support</p>
          <h1>Help &amp; tickets</h1>
          <p className="sub">
            Got a problem with the site, an account, or a transaction? Tell
            us about it.
          </p>
        </header>

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}

        <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
          <h2 className="card-heading">New ticket</h2>
          <form
            action={createTicket}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <Field label="Subject" htmlFor="subject">
              <Input
                id="subject"
                name="subject"
                type="text"
                maxLength={200}
                required
                placeholder="e.g. Can't upload photos"
              />
            </Field>
            <Field label="What's going on?" htmlFor="body">
              <Textarea
                id="body"
                name="body"
                rows={5}
                maxLength={4000}
                required
                placeholder="Steps you took, what you expected, what happened…"
              />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Submit ticket
              </Button>
            </div>
          </form>
        </section>

        <h2 className="card-heading" style={{ marginBottom: "var(--s-3)" }}>
          Your tickets{" "}
          <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
            ({result.rows.length})
          </span>
        </h2>

        {result.rows.length === 0 ? (
          <div className="empty-state">
            <h3>No tickets yet</h3>
            <p style={{ margin: 0 }}>
              When you raise one, it&rsquo;ll show up here.
            </p>
          </div>
        ) : (
          <ul className="ticket-list">
            {result.rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/support/${t.id}`}
                  className={`ticket-item ${t.status === "closed" ? "is-closed" : ""}`}
                >
                  <div className="ticket-row">
                    <span className="ticket-subject">{t.subject}</span>
                    <span
                      className={`ticket-status ticket-status--${t.status}`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="ticket-meta">
                    {t.msg_count} message{Number(t.msg_count) === 1 ? "" : "s"}{" "}
                    · last activity {formatRel(t.updated_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

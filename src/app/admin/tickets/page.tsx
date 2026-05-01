import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_email: string | null;
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

export default async function AdminTicketsPage() {
  await requireAdmin();

  const result = await query<Row>(
    `SELECT t.id::text,
            u.email AS user_email,
            t.subject,
            t.status,
            t.updated_at::text,
            (SELECT COUNT(*)::text FROM support_messages
              WHERE ticket_id = t.id) AS msg_count
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
      ORDER BY (t.status = 'closed'), t.updated_at DESC`,
  );

  const open = result.rows.filter((r) => r.status === "open").length;
  const closed = result.rows.length - open;

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Support</p>
        <h1>Tickets</h1>
        <p className="sub">
          {result.rows.length} total · {open} open · {closed} closed
        </p>
      </header>

      {result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No tickets yet</h3>
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
                  <span className={`ticket-status ticket-status--${t.status}`}>
                    {t.status}
                  </span>
                </div>
                <div className="ticket-meta">
                  {t.user_email ?? "Unknown"} ·{" "}
                  {t.msg_count} message{Number(t.msg_count) === 1 ? "" : "s"} ·
                  last activity {formatRel(t.updated_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

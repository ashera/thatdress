import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  sendTicketMessage,
  setTicketStatus,
} from "@/lib/actions/support";
import { Button, Textarea } from "../../_components/ui";
import { AutoRefresh } from "../../_components/auto-refresh";

export const dynamic = "force-dynamic";

type TicketHead = {
  id: string;
  user_id: string;
  user_email: string | null;
  subject: string;
  status: string;
  created_at: string;
};

type Message = {
  id: string;
  sender_id: string;
  sender_email: string | null;
  sender_is_admin: boolean;
  body: string;
  created_at: string;
};

function fmt(s: string): string {
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function shortName(email: string | null): string {
  if (!email) return "Unknown";
  return email.split("@")[0] ?? email;
}

function initials(email: string | null): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const headRes = await query<TicketHead>(
    `SELECT t.id::text,
            t.user_id::text,
            u.email AS user_email,
            t.subject,
            t.status,
            t.created_at::text
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const head = headRes.rows[0];
  if (!head) notFound();

  const isOwner = head.user_id === me.id;
  if (!isOwner && !me.isAdmin) redirect("/support");

  const msgsRes = await query<Message>(
    `SELECT m.id::text,
            m.sender_id::text,
            u.email AS sender_email,
            COALESCE(u.is_admin, FALSE) AS sender_is_admin,
            m.body,
            m.created_at::text
       FROM support_messages m
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.ticket_id = $1::bigint
      ORDER BY m.created_at`,
    [id],
  );

  return (
    <div className="page page--pad">
      <AutoRefresh intervalMs={10000} />

      <Link
        href={me.isAdmin ? "/admin/tickets" : "/support"}
        className="back-link"
      >
        ← {me.isAdmin ? "All tickets" : "Your tickets"}
      </Link>

      <header className="messages-header">
        <p className="eyebrow">
          Ticket #{head.id} · opened {fmt(head.created_at)} by{" "}
          {shortName(head.user_email)}
        </p>
        <h1 style={{ marginBottom: "var(--s-3)" }}>{head.subject}</h1>
        <span
          className={`ticket-status ticket-status--${head.status}`}
          style={{ display: "inline-block" }}
        >
          {head.status}
        </span>
      </header>

      <ul className="thread-messages" style={{ marginTop: "var(--s-7)" }}>
        {msgsRes.rows.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <li
              key={m.id}
              className={`thread-message ${mine ? "is-mine" : "is-theirs"}`}
            >
              {!mine && (
                <span className="thread-avatar" aria-hidden>
                  {initials(m.sender_email)}
                </span>
              )}
              <div className="thread-bubble">
                {!mine && (
                  <div className="thread-time" style={{ marginBottom: 4 }}>
                    {shortName(m.sender_email)}
                    {m.sender_is_admin ? " · Admin" : ""}
                  </div>
                )}
                <div className="thread-body">{m.body}</div>
                <div className="thread-time">{fmt(m.created_at)}</div>
              </div>
            </li>
          );
        })}
      </ul>

      <form action={sendTicketMessage} className="thread-compose">
        <input type="hidden" name="ticketId" value={head.id} />
        <Textarea
          name="body"
          rows={3}
          maxLength={4000}
          required
          placeholder="Write a reply…"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "var(--s-3)",
          }}
        >
          <Button type="submit" variant="primary" iconRight="arrow">
            Send reply
          </Button>
        </div>
      </form>

      <form
        action={setTicketStatus}
        style={{
          marginTop: "var(--s-3)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <input type="hidden" name="ticketId" value={head.id} />
        <input
          type="hidden"
          name="status"
          value={head.status === "closed" ? "open" : "closed"}
        />
        <Button type="submit" variant="ghost" size="sm">
          {head.status === "closed" ? "Reopen ticket" : "Close ticket"}
        </Button>
      </form>
    </div>
  );
}

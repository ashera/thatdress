import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ButtonLink } from "../_components/ui";
import { AutoRefresh } from "../_components/auto-refresh";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  listing_id: string;
  listing_title: string;
  buyer_id: string;
  seller_id: string;
  other_email: string | null;
  last_body: string | null;
  last_at: string | null;
  unread_count: string;
  primary_image_id: string | null;
};

async function fetchConversations(userId: string) {
  try {
    const result = await query<ConversationRow>(
      `SELECT c.id::text,
              c.listing_id::text,
              l.title AS listing_title,
              c.buyer_id::text,
              c.seller_id::text,
              CASE
                WHEN c.buyer_id::text = $1 THEN sl.email
                ELSE bu.email
              END AS other_email,
              (
                SELECT body FROM messages
                  WHERE conversation_id = c.id
                  ORDER BY created_at DESC LIMIT 1
              ) AS last_body,
              (
                SELECT created_at::text FROM messages
                  WHERE conversation_id = c.id
                  ORDER BY created_at DESC LIMIT 1
              ) AS last_at,
              (
                SELECT COUNT(*)::text FROM messages
                  WHERE conversation_id = c.id
                    AND sender_id::text <> $1
                    AND read_at IS NULL
              ) AS unread_count,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = c.listing_id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id
         FROM conversations c
         JOIN listings l ON l.id = c.listing_id
         LEFT JOIN users bu ON bu.id = c.buyer_id
         LEFT JOIN users sl ON sl.id = c.seller_id
        WHERE c.buyer_id::text = $1 OR c.seller_id::text = $1
        ORDER BY c.updated_at DESC`,
      [userId],
    );
    return { ok: true as const, rows: result.rows };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function formatRelative(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortName(email: string | null): string {
  if (!email) return "Unknown";
  return email.split("@")[0] ?? email;
}

export default async function MessagesIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/messages");

  const result = await fetchConversations(user.id);

  return (
    <div className="page page--pad">
      <AutoRefresh intervalMs={10000} />

      <header className="messages-header">
        <p className="eyebrow">Inbox</p>
        <h1>Messages</h1>
        <p className="sub">
          {result.ok && result.rows.length > 0
            ? `${result.rows.length} conversation${result.rows.length === 1 ? "" : "s"}.`
            : "No conversations yet."}
        </p>
      </header>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load messages.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No conversations yet</h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            Start one by clicking <strong>Contact seller</strong> on any
            listing.
          </p>
          <ButtonLink href="/listings" variant="primary" iconRight="arrow">
            Browse listings
          </ButtonLink>
        </div>
      ) : (
        <ul className="conversation-list">
          {result.rows.map((c) => {
            const role = c.buyer_id === user.id ? "Buying" : "Selling";
            const unread = Number(c.unread_count);
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className={`conversation-item ${unread > 0 ? "is-unread" : ""}`}
                >
                  <div className="conversation-thumb">
                    {c.primary_image_id ? (
                      <img
                        src={`/api/listings/${c.listing_id}/images/${c.primary_image_id}`}
                        alt=""
                      />
                    ) : (
                      <span aria-hidden>🚲</span>
                    )}
                  </div>
                  <div className="conversation-body">
                    <div className="conversation-top">
                      <span className="conversation-listing">
                        {c.listing_title}
                      </span>
                      <span className="conversation-time">
                        {formatRelative(c.last_at)}
                      </span>
                    </div>
                    <div className="conversation-meta">
                      <span className="conversation-role">{role}</span>
                      <span> · </span>
                      <span>{shortName(c.other_email)}</span>
                    </div>
                    <div className="conversation-preview">
                      {c.last_body
                        ? c.last_body.length > 120
                          ? `${c.last_body.slice(0, 120)}…`
                          : c.last_body
                        : <em>No messages yet.</em>}
                    </div>
                  </div>
                  {unread > 0 && (
                    <span className="conversation-unread" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

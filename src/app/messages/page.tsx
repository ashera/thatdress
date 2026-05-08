import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ButtonLink } from "../_components/ui";
import { AutoRefresh } from "../_components/auto-refresh";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  listing_id: string | null;
  listing_title: string | null;
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
         LEFT JOIN listings l ON l.id = c.listing_id
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

function ConversationItem({
  c,
  userId,
}: {
  c: ConversationRow;
  userId: string;
}) {
  const unread = Number(c.unread_count);
  const isDm = c.listing_id === null;
  // In DMs the buyer is always the admin (per sendAdminMessage), so the
  // OTHER party is the user when current viewer is the admin (=buyer)
  // and vice versa.
  const otherLabel = isDm
    ? c.buyer_id === userId
      ? "User"
      : "Admin"
    : c.buyer_id === userId
      ? "Seller"
      : "Buyer";
  return (
    <li>
      <Link
        href={`/messages/${c.id}`}
        className={`conversation-item ${unread > 0 ? "is-unread" : ""}`}
      >
        <div className="conversation-thumb">
          {c.primary_image_id && c.listing_id ? (
            <img
              src={`/api/listings/${c.listing_id}/images/${c.primary_image_id}?w=200`}
              alt=""
            />
          ) : (
            <span aria-hidden>{isDm ? "✉️" : "🚲"}</span>
          )}
        </div>
        <div className="conversation-body">
          <div className="conversation-top">
            <span className="conversation-listing">
              {isDm
                ? `Direct message · ${shortName(c.other_email)}`
                : c.listing_title}
            </span>
            <span className="conversation-time">
              {formatRelative(c.last_at)}
            </span>
          </div>
          <div className="conversation-meta">
            <span className="conversation-role">{otherLabel}</span>
            {!isDm && (
              <>
                <span> · </span>
                <span>{shortName(c.other_email)}</span>
              </>
            )}
          </div>
          <div className="conversation-preview">
            {c.last_body ? (
              c.last_body.length > 120 ? (
                `${c.last_body.slice(0, 120)}…`
              ) : (
                c.last_body
              )
            ) : (
              <em>No messages yet.</em>
            )}
          </div>
        </div>
        {unread > 0 && (
          <span
            className="conversation-unread"
            aria-label={`${unread} unread`}
          >
            {unread}
          </span>
        )}
      </Link>
    </li>
  );
}

export default async function MessagesIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/messages");

  const result = await fetchConversations(user.id);

  if (!result.ok) {
    return (
      <div className="page page--pad">
        <AutoRefresh intervalMs={10000} />
        <header className="messages-header">
          <p className="eyebrow">Inbox</p>
          <h1>Messages</h1>
        </header>
        <div className="form-error">
          <strong>Could not load messages.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      </div>
    );
  }

  const dmRows = result.rows.filter((c) => c.listing_id === null);
  const sellingRows = result.rows.filter(
    (c) => c.listing_id !== null && c.seller_id === user.id,
  );
  const buyingRows = result.rows.filter(
    (c) => c.listing_id !== null && c.buyer_id === user.id,
  );
  const sumUnread = (rows: ConversationRow[]) =>
    rows.reduce((n, c) => n + Number(c.unread_count), 0);
  const sellingUnread = sumUnread(sellingRows);
  const buyingUnread = sumUnread(buyingRows);
  const dmUnread = sumUnread(dmRows);

  return (
    <div className="page page--pad">
      <AutoRefresh intervalMs={10000} />

      <header className="messages-header">
        <p className="eyebrow">Inbox</p>
        <h1>Messages</h1>
        <p className="sub">
          {result.rows.length === 0
            ? "No conversations yet."
            : `${result.rows.length} conversation${result.rows.length === 1 ? "" : "s"}.`}
        </p>
      </header>

      {result.rows.length === 0 ? (
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
        <>
          {dmRows.length > 0 && (
            <section className="inbox-section">
              <div className="inbox-section-head">
                <h2>Direct messages</h2>
                <span className="inbox-section-count">
                  {dmRows.length}
                  {dmUnread > 0 && (
                    <span className="inbox-section-unread">
                      · {dmUnread} unread
                    </span>
                  )}
                </span>
              </div>
              <ul className="conversation-list">
                {dmRows.map((c) => (
                  <ConversationItem key={c.id} c={c} userId={user.id} />
                ))}
              </ul>
            </section>
          )}

          <section className="inbox-section">
            <div className="inbox-section-head">
              <h2>Buyers asking about your listings</h2>
              <span className="inbox-section-count">
                {sellingRows.length}
                {sellingUnread > 0 && (
                  <span className="inbox-section-unread">
                    · {sellingUnread} unread
                  </span>
                )}
              </span>
            </div>
            {sellingRows.length === 0 ? (
              <p className="inbox-section-empty">
                No buyer enquiries yet. They&rsquo;ll show up here when
                someone clicks <strong>Contact seller</strong> on one of
                your listings.
              </p>
            ) : (
              <ul className="conversation-list">
                {sellingRows.map((c) => (
                  <ConversationItem key={c.id} c={c} userId={user.id} />
                ))}
              </ul>
            )}
          </section>

          <section className="inbox-section">
            <div className="inbox-section-head">
              <h2>Your conversations with sellers</h2>
              <span className="inbox-section-count">
                {buyingRows.length}
                {buyingUnread > 0 && (
                  <span className="inbox-section-unread">
                    · {buyingUnread} unread
                  </span>
                )}
              </span>
            </div>
            {buyingRows.length === 0 ? (
              <p className="inbox-section-empty">
                You haven&rsquo;t reached out to any sellers yet. Start by
                clicking <strong>Contact seller</strong> on a listing
                you&rsquo;re interested in.
              </p>
            ) : (
              <ul className="conversation-list">
                {buyingRows.map((c) => (
                  <ConversationItem key={c.id} c={c} userId={user.id} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

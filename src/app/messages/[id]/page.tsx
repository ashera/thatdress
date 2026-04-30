import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { sendMessage } from "@/lib/actions/messages";
import { markConversationRead } from "@/lib/messages";
import { Button, Textarea } from "../../_components/ui";
import { AutoRefresh } from "../../_components/auto-refresh";

export const dynamic = "force-dynamic";

type ConversationHead = {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_price_cents: number;
  buyer_id: string;
  seller_id: string;
  buyer_email: string | null;
  seller_email: string | null;
  primary_image_id: string | null;
};

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

async function fetchConversation(id: string, userId: string): Promise<{
  head: ConversationHead;
  messages: Message[];
} | null> {
  if (!/^\d+$/.test(id)) return null;
  const headRes = await query<ConversationHead>(
    `SELECT c.id::text,
            c.listing_id::text,
            l.title AS listing_title,
            l.price_cents AS listing_price_cents,
            c.buyer_id::text,
            c.seller_id::text,
            bu.email AS buyer_email,
            sl.email AS seller_email,
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
      WHERE c.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const head = headRes.rows[0];
  if (!head) return null;
  if (head.buyer_id !== userId && head.seller_id !== userId) return null;

  const msgRes = await query<Message>(
    `SELECT id::text, sender_id::text, body, created_at::text, read_at::text
       FROM messages
      WHERE conversation_id = $1::bigint
      ORDER BY created_at`,
    [id],
  );

  return { head, messages: msgRes.rows };
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

function formatTime(s: string): string {
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

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const data = await fetchConversation(id, user.id);
  if (!data) notFound();

  const { head, messages } = data;
  const otherEmail =
    head.buyer_id === user.id ? head.seller_email : head.buyer_email;
  const role = head.buyer_id === user.id ? "Buying" : "Selling";

  // Mark incoming messages as read.
  await markConversationRead(id, user.id);

  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(head.listing_price_cents / 100);

  return (
    <div className="page page--pad">
      <AutoRefresh intervalMs={5000} />

      <Link href="/messages" className="back-link">
        ← All messages
      </Link>

      <div className="thread-head">
        <Link href={`/listings/${head.listing_id}`} className="thread-listing">
          <div className="thread-thumb">
            {head.primary_image_id ? (
              <img
                src={`/api/listings/${head.listing_id}/images/${head.primary_image_id}`}
                alt=""
              />
            ) : (
              <span aria-hidden>🚲</span>
            )}
          </div>
          <div>
            <div className="thread-listing-title">{head.listing_title}</div>
            <div className="thread-listing-price">{price}</div>
          </div>
        </Link>
        <div className="thread-other">
          <span className="thread-role">{role}</span>
          <span className="thread-other-name">{shortName(otherEmail)}</span>
        </div>
      </div>

      <ul className="thread-messages">
        {messages.length === 0 && (
          <li className="thread-empty">
            No messages yet — say hello below.
          </li>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <li
              key={m.id}
              className={`thread-message ${mine ? "is-mine" : "is-theirs"}`}
            >
              {!mine && (
                <span className="thread-avatar" aria-hidden>
                  {initials(otherEmail)}
                </span>
              )}
              <div className="thread-bubble">
                <div className="thread-body">{m.body}</div>
                <div className="thread-time">{formatTime(m.created_at)}</div>
              </div>
            </li>
          );
        })}
      </ul>

      <form action={sendMessage} className="thread-compose">
        <input type="hidden" name="conversationId" value={head.id} />
        <Textarea
          name="body"
          rows={3}
          maxLength={4000}
          required
          placeholder="Type your message…"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "var(--s-3)",
          }}
        >
          <Button type="submit" variant="primary" iconRight="arrow">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

import "server-only";
import { query } from "@/lib/db";

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  if (!/^\d+$/.test(conversationId)) return;
  try {
    await query(
      `UPDATE messages
          SET read_at = NOW()
        WHERE conversation_id = $1::bigint
          AND sender_id <> $2::bigint
          AND read_at IS NULL`,
      [conversationId, userId],
    );
  } catch {
    // Best-effort — don't break page render on a failed read marker.
  }
}

export async function unreadMessageCount(userId: string): Promise<number> {
  try {
    const r = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.read_at IS NULL
          AND m.sender_id <> $1::bigint
          AND (c.buyer_id = $1::bigint OR c.seller_id = $1::bigint)`,
      [userId],
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

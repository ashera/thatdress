"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const MESSAGE_MAX = 4000;

async function ensureParticipant(
  conversationId: string,
  userId: string,
): Promise<{ buyer_id: string; seller_id: string } | null> {
  if (!/^\d+$/.test(conversationId)) return null;
  const r = await query<{ buyer_id: string; seller_id: string }>(
    `SELECT buyer_id::text, seller_id::text
       FROM conversations
      WHERE id = $1::bigint
      LIMIT 1`,
    [conversationId],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.buyer_id !== userId && row.seller_id !== userId) return null;
  return row;
}

export async function startConversation(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    const listingId = String(formData.get("listingId") ?? "");
    redirect(`/login?next=${encodeURIComponent(`/listings/${listingId}`)}`);
  }

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) redirect("/listings");

  const listingRes = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const seller = listingRes.rows[0];
  if (!seller || !seller.seller_id) redirect("/listings");
  if (seller.seller_id === user.id) {
    // You can't message yourself.
    redirect(`/listings/${listingId}`);
  }

  // Find or create.
  const existing = await query<{ id: string }>(
    `SELECT id::text FROM conversations
      WHERE listing_id = $1::bigint AND buyer_id = $2::bigint
      LIMIT 1`,
    [listingId, user.id],
  );
  let conversationId = existing.rows[0]?.id;
  if (!conversationId) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id)
       VALUES ($1::bigint, $2::bigint, $3::bigint)
       RETURNING id::text`,
      [listingId, user.id, seller.seller_id],
    );
    conversationId = inserted.rows[0]!.id;
  }

  revalidatePath("/messages");
  redirect(`/messages/${conversationId}`);
}

export async function sendMessage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversationId = String(formData.get("conversationId") ?? "");
  const ok = await ensureParticipant(conversationId, user.id);
  if (!ok) redirect("/messages");

  const body = String(formData.get("body") ?? "").trim().slice(0, MESSAGE_MAX);
  if (!body) redirect(`/messages/${conversationId}`);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1::bigint, $2::bigint, $3)`,
      [conversationId, user.id, body],
    );
    await client.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`,
      [conversationId],
    );
  });

  revalidatePath(`/messages/${conversationId}`);
  revalidatePath(`/messages`);
  redirect(`/messages/${conversationId}`);
}


"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notifyMessageRecipient } from "@/lib/notifications";

const NOTE_MAX = 500;
const PRICE_MAX_DOLLARS = 1_000_000;

function parseAmountToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  if (dollars > PRICE_MAX_DOLLARS) return null;
  return Math.round(dollars * 100);
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export async function makeOffer(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    const next = String(formData.get("listingId") ?? "");
    redirect(
      `/login?next=${encodeURIComponent(`/listings/${next}/offer`)}`,
    );
  }

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) redirect("/listings");

  const amountCents = parseAmountToCents(
    String(formData.get("amount") ?? ""),
  );
  if (amountCents === null) {
    redirect(`/listings/${listingId}/offer?error=invalid-amount`);
  }
  const note =
    String(formData.get("note") ?? "")
      .trim()
      .slice(0, NOTE_MAX) || null;

  // Verify listing accepts offers and isn't owned by the buyer.
  const r = await query<{
    seller_id: string | null;
    offers_enabled: boolean;
    title: string;
  }>(
    `SELECT seller_id::text, offers_enabled, title
       FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row || !row.seller_id) redirect("/listings");
  if (!row.offers_enabled) redirect(`/listings/${listingId}`);
  if (row.seller_id === user.id) redirect(`/listings/${listingId}`);

  // Find or create the conversation between buyer and seller.
  const existing = await query<{ id: string }>(
    `SELECT id::text FROM conversations
      WHERE listing_id = $1::bigint AND buyer_id = $2::bigint
      LIMIT 1`,
    [listingId, user.id],
  );
  let conversationId = existing.rows[0]?.id;
  if (!conversationId) {
    const ins = await query<{ id: string }>(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id)
       VALUES ($1::bigint, $2::bigint, $3::bigint)
       RETURNING id::text`,
      [listingId, user.id, row.seller_id],
    );
    conversationId = ins.rows[0]!.id;
  }

  // Record the offer.
  await query(
    `INSERT INTO offers (listing_id, buyer_id, amount_cents, note)
     VALUES ($1::bigint, $2::bigint, $3, $4)`,
    [listingId, user.id, amountCents, note],
  );

  // Post a formatted message in the thread so the seller sees it inline.
  const body = note
    ? `💰 Offer: ${formatPrice(amountCents)}\n\n${note}`
    : `💰 Offer: ${formatPrice(amountCents)}`;
  await query(
    `INSERT INTO messages (conversation_id, sender_id, body)
     VALUES ($1::bigint, $2::bigint, $3)`,
    [conversationId, user.id, body],
  );
  await query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`,
    [conversationId],
  );

  await notifyMessageRecipient(conversationId, user.id, body);

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  redirect(`/messages/${conversationId}`);
}

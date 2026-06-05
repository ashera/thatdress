"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { notifyMessageRecipient } from "@/lib/notifications";

const TITLES = new Set(["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"]);

function clean(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
  return v.length > 0 ? v : null;
}

function getId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  return raw;
}

export async function updateUserAsAdmin(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  const titleRaw = clean(formData, "title", 16);
  const title = titleRaw && TITLES.has(titleRaw) ? titleRaw : null;
  const firstName = clean(formData, "first_name", 64);
  const surname = clean(formData, "surname", 64);
  const town = clean(formData, "town", 64);
  const postcode = clean(formData, "postcode", 16);

  await query(
    `UPDATE users
        SET title = $1,
            first_name = $2,
            surname = $3,
            town = $4,
            postcode = $5
      WHERE id = $6::bigint`,
    [title, firstName, surname, town, postcode, id],
  );

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?saved=1`);
}

export async function toggleAdminRole(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  // Don't let an admin demote themselves to avoid lockout.
  if (id === me.id) redirect(`/admin/users/${id}?error=self-demote`);

  await query(
    `UPDATE users SET is_admin = NOT is_admin WHERE id = $1::bigint`,
    [id],
  );

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?saved=1`);
}

export async function togglePartnerRole(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  // Flip the flag; when demoting a partner, drop their marketing
  // regions too so the junction doesn't keep stale links around.
  await withTransaction(async (client) => {
    const r = await client.query<{ is_partner: boolean }>(
      `UPDATE users SET is_partner = NOT is_partner
        WHERE id = $1::bigint
        RETURNING is_partner`,
      [id],
    );
    if (!r.rows[0]?.is_partner) {
      await client.query(
        `DELETE FROM partner_marketing_regions WHERE user_id = $1::bigint`,
        [id],
      );
    }
  });

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?saved=1`);
}

export async function updatePartnerMarketingRegions(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  // Multiple region_id checkboxes — keep only well-formed numeric ids,
  // de-duped. The INSERT re-validates each against the regions table.
  const regionIds = Array.from(
    new Set(
      formData
        .getAll("region_id")
        .map((v) => String(v).trim())
        .filter((v) => /^\d+$/.test(v)),
    ),
  );

  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM partner_marketing_regions WHERE user_id = $1::bigint`,
      [id],
    );
    if (regionIds.length > 0) {
      // Insert only ids that exist in regions; ON CONFLICT guards the PK.
      await client.query(
        `INSERT INTO partner_marketing_regions (user_id, region_id)
         SELECT $1::bigint, r.id
           FROM regions r
          WHERE r.id = ANY($2::bigint[])
         ON CONFLICT (user_id, region_id) DO NOTHING`,
        [id, regionIds],
      );
    }
  });

  revalidatePath(`/admin/users/${id}`);
  redirect(`/admin/users/${id}?saved=1`);
}

export async function toggleUserSuspended(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  // Don't let an admin suspend themselves.
  if (id === me.id) redirect(`/admin/users/${id}?error=self-suspend`);

  await query(
    `UPDATE users
        SET suspended_at = CASE
          WHEN suspended_at IS NULL THEN NOW()
          ELSE NULL
        END
      WHERE id = $1::bigint`,
    [id],
  );

  // Kill any active sessions on suspend.
  await query(
    `DELETE FROM sessions
      WHERE user_id = $1::bigint
        AND EXISTS (
          SELECT 1 FROM users WHERE id = $1::bigint AND suspended_at IS NOT NULL
        )`,
    [id],
  );

  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?saved=1`);
}

export async function sendAdminMessage(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = getId(formData, "userId");
  if (!id) redirect("/admin/users");

  const body = String(formData.get("body") ?? "")
    .trim()
    .slice(0, 4000);
  if (!body) redirect(`/admin/users/${id}?error=empty-message`);

  // Find or create the admin DM thread (listing_id IS NULL, buyer = admin,
  // seller = target user). Partial unique index keeps this idempotent.
  const existing = await query<{ id: string }>(
    `SELECT id::text FROM conversations
      WHERE listing_id IS NULL
        AND buyer_id = $1::bigint
        AND seller_id = $2::bigint
      LIMIT 1`,
    [me.id, id],
  );
  let conversationId = existing.rows[0]?.id;
  if (!conversationId) {
    const ins = await query<{ id: string }>(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id)
       VALUES (NULL, $1::bigint, $2::bigint)
       RETURNING id::text`,
      [me.id, id],
    );
    conversationId = ins.rows[0]!.id;
  }

  await query(
    `INSERT INTO messages (conversation_id, sender_id, body)
     VALUES ($1::bigint, $2::bigint, $3)`,
    [conversationId, me.id, body],
  );
  await query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`,
    [conversationId],
  );

  await notifyMessageRecipient(conversationId, me.id, body);

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  redirect(`/messages/${conversationId}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const SUBJECT_MAX = 200;
const BODY_MAX = 4000;

async function loadParticipants(
  ticketId: string,
): Promise<{ user_id: string } | null> {
  if (!/^\d+$/.test(ticketId)) return null;
  const r = await query<{ user_id: string }>(
    `SELECT user_id::text FROM support_tickets WHERE id = $1::bigint LIMIT 1`,
    [ticketId],
  );
  return r.rows[0] ?? null;
}

export async function createTicket(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/support");

  const subject = String(formData.get("subject") ?? "")
    .trim()
    .slice(0, SUBJECT_MAX);
  const body = String(formData.get("body") ?? "")
    .trim()
    .slice(0, BODY_MAX);

  if (!subject) redirect("/support?error=missing-subject");
  if (!body) redirect("/support?error=missing-body");

  const ticketId = await withTransaction(async (client) => {
    const t = await client.query<{ id: string }>(
      `INSERT INTO support_tickets (user_id, subject)
       VALUES ($1::bigint, $2)
       RETURNING id::text`,
      [user.id, subject],
    );
    const id = t.rows[0]!.id;
    await client.query(
      `INSERT INTO support_messages (ticket_id, sender_id, body)
       VALUES ($1::bigint, $2::bigint, $3)`,
      [id, user.id, body],
    );
    return id;
  });

  revalidatePath("/support");
  revalidatePath("/admin/tickets");
  redirect(`/support/${ticketId}`);
}

export async function sendTicketMessage(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ticketId = String(formData.get("ticketId") ?? "");
  const ticket = await loadParticipants(ticketId);
  if (!ticket) redirect("/support");
  if (ticket.user_id !== user.id && !user.isAdmin) redirect("/support");

  const body = String(formData.get("body") ?? "")
    .trim()
    .slice(0, BODY_MAX);
  if (!body) redirect(`/support/${ticketId}`);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO support_messages (ticket_id, sender_id, body)
       VALUES ($1::bigint, $2::bigint, $3)`,
      [ticketId, user.id, body],
    );
    await client.query(
      `UPDATE support_tickets
          SET updated_at = NOW(),
              status = CASE
                WHEN status = 'closed' THEN 'open'
                ELSE status
              END
        WHERE id = $1::bigint`,
      [ticketId],
    );
  });

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  revalidatePath("/admin/tickets");
  redirect(`/support/${ticketId}`);
}

export async function setTicketStatus(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ticketId = String(formData.get("ticketId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["open", "closed"].includes(status)) redirect("/support");

  const ticket = await loadParticipants(ticketId);
  if (!ticket) redirect("/support");
  if (ticket.user_id !== user.id && !user.isAdmin) redirect("/support");

  await query(
    `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2::bigint`,
    [status, ticketId],
  );

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  revalidatePath("/admin/tickets");
  redirect(`/support/${ticketId}`);
}

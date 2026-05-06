import "server-only";
import { query } from "@/lib/db";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

/**
 * Email the participant on the other side of a conversation about a new
 * message. Fire-and-forget — failures are logged but don't propagate.
 */
export async function notifyMessageRecipient(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<void> {
  try {
    const r = await query<{
      to_email: string | null;
      from_email: string | null;
      listing_title: string | null;
      listing_id: string | null;
    }>(
      `SELECT (CASE WHEN c.buyer_id::text = $2 THEN su.email ELSE bu.email END) AS to_email,
              (CASE WHEN c.buyer_id::text = $2 THEN bu.email ELSE su.email END) AS from_email,
              l.title AS listing_title,
              c.listing_id::text
         FROM conversations c
         LEFT JOIN listings l  ON l.id  = c.listing_id
         LEFT JOIN users    bu ON bu.id = c.buyer_id
         LEFT JOIN users    su ON su.id = c.seller_id
        WHERE c.id = $1::bigint
        LIMIT 1`,
      [conversationId, senderId],
    );
    const row = r.rows[0];
    if (!row?.to_email) return;

    const baseUrl = await getEmailBaseUrl();
    const url = `${baseUrl}/messages/${conversationId}`;
    const subject = row.listing_title
      ? `New message about: ${row.listing_title}`
      : "New direct message";
    const preview =
      body.length > 240 ? `${body.slice(0, 240).trim()}…` : body;
    const senderLabel = row.from_email
      ? row.from_email.split("@")[0] ?? row.from_email
      : "A user";

    const html = emailLayout({
      preheader: subject,
      heading: subject,
      body: `
        <p><strong>${escapeHtml(senderLabel)}</strong> sent you a message${row.listing_title ? ` about <em>${escapeHtml(row.listing_title)}</em>` : ""}:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#f7f6f3;border-left:3px solid #e9e5df;color:#3a342f;white-space:pre-wrap;">${escapeHtml(preview)}</blockquote>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Open conversation</a>
        </p>
      `,
    });

    await sendEmail({
      to: row.to_email,
      subject,
      html,
      text: `${senderLabel} sent: ${preview}\n\nOpen the thread: ${url}`,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notify-message] failed", e);
  }
}

/**
 * Email the OTHER party on a support ticket reply.
 * If the user replied → email all admins.
 * If an admin replied → email the ticket owner.
 */
export async function notifyTicketReply(
  ticketId: string,
  senderId: string,
  body: string,
  senderIsAdmin: boolean,
): Promise<void> {
  try {
    const head = await query<{
      user_id: string;
      user_email: string | null;
      subject: string;
    }>(
      `SELECT t.user_id::text, u.email AS user_email, t.subject
         FROM support_tickets t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = $1::bigint LIMIT 1`,
      [ticketId],
    );
    const ticket = head.rows[0];
    if (!ticket) return;

    let recipients: string[] = [];
    if (senderIsAdmin) {
      // Admin replied → email the user.
      if (ticket.user_email) recipients = [ticket.user_email];
    } else {
      // User replied → email every active admin.
      const r = await query<{ email: string }>(
        `SELECT email FROM users
          WHERE is_admin = TRUE AND suspended_at IS NULL`,
      );
      recipients = r.rows.map((row) => row.email).filter(Boolean);
    }
    if (recipients.length === 0) return;

    const baseUrl = await getEmailBaseUrl();
    const url = `${baseUrl}/support/${ticketId}`;
    const subject = `Reply on ticket: ${ticket.subject}`;
    const preview =
      body.length > 240 ? `${body.slice(0, 240).trim()}…` : body;

    const html = emailLayout({
      preheader: subject,
      heading: subject,
      body: `
        <p>New reply on support ticket <strong>#${escapeHtml(ticketId)} — ${escapeHtml(ticket.subject)}</strong>:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;background:#f7f6f3;border-left:3px solid #e9e5df;color:#3a342f;white-space:pre-wrap;">${escapeHtml(preview)}</blockquote>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Open ticket</a>
        </p>
      `,
    });

    await sendEmail({
      to: recipients,
      subject,
      html,
      text: `Reply on ticket #${ticketId}:\n${preview}\n\nOpen: ${url}`,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[notify-ticket] failed", e);
  }
}

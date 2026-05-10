import "server-only";
import { query } from "@/lib/db";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

export type RelistNudgeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-found"
        | "no-owner"
        | "not-eligible"
        | "owner-suspended"
        | "owner-unverified"
        | "no-email"
        | "send-failed";
      detail?: string;
    };

type DressRow = {
  dress_id: string;
  disposition: string;
  current_owner_user_id: string | null;
  owner_email: string | null;
  owner_first_name: string | null;
  owner_suspended: boolean;
  owner_email_verified: boolean;
  designer_name: string | null;
  model: string | null;
  via_title: string | null;
};

/**
 * Send a single relist-nudge email for a specific dress and roll
 * the schedule timestamps forward. Used both by the cron job
 * (/api/cron/relist-nudge — selects a batch of due dresses then
 * loops calling this) and the admin-only manual override on
 * /admin/dresses (force-fire regardless of schedule).
 *
 * Doesn't check the time-based gates (next_relist_nudge_at,
 * last_relist_nudge_sent_at) — that's the caller's job. The cron
 * filters in its SQL; the admin action wants to bypass.
 */
export async function sendRelistNudge(
  dressId: string,
): Promise<RelistNudgeResult> {
  if (!/^\d+$/.test(dressId)) {
    return { ok: false, reason: "not-found" };
  }

  let row: DressRow | undefined;
  try {
    const r = await query<DressRow>(
      `SELECT d.id::text                              AS dress_id,
              d.disposition,
              d.current_owner_user_id::text            AS current_owner_user_id,
              u.email                                  AS owner_email,
              u.first_name                             AS owner_first_name,
              (u.suspended_at IS NOT NULL)             AS owner_suspended,
              (u.email_verified_at IS NOT NULL)        AS owner_email_verified,
              des.name                                 AS designer_name,
              d.model                                  AS model,
              (
                SELECT l.title
                  FROM dress_ownership_events e
                  JOIN listings l ON l.id = e.via_listing_id
                 WHERE e.dress_id   = d.id
                   AND e.to_user_id = d.current_owner_user_id
                   AND e.event_type = 'sold'
                 ORDER BY e.occurred_at DESC
                 LIMIT 1
              )                                        AS via_title
         FROM dresses d
         LEFT JOIN users     u   ON u.id   = d.current_owner_user_id
         LEFT JOIN designers des ON des.id = d.designer_id
        WHERE d.id = $1::bigint
        LIMIT 1`,
      [dressId],
    );
    row = r.rows[0];
  } catch (e) {
    return {
      ok: false,
      reason: "send-failed",
      detail: e instanceof Error ? e.message : "db error",
    };
  }

  if (!row) return { ok: false, reason: "not-found" };
  if (!row.current_owner_user_id) return { ok: false, reason: "no-owner" };
  // Disposition must be 'in-use' for a nudge to make sense.
  // 'available' means the owner has already relisted (or is
  // drafting one); 'kept' means they opted out; 'lost' means we
  // don't know who has it. Cron's SQL filter already excludes
  // these, but the admin force-fire path doesn't, so guard here
  // as a final defense.
  if (row.disposition !== "in-use") {
    return {
      ok: false,
      reason: "not-eligible",
      detail: `disposition is '${row.disposition}'`,
    };
  }
  if (row.owner_suspended) return { ok: false, reason: "owner-suspended" };
  if (!row.owner_email_verified) {
    return { ok: false, reason: "owner-unverified" };
  }
  if (!row.owner_email) return { ok: false, reason: "no-email" };

  const dressLabel =
    [row.designer_name, row.model].filter(Boolean).join(" ") ||
    row.via_title ||
    "your frockd dress";
  const greeting = row.owner_first_name
    ? `Hi ${escapeHtml(row.owner_first_name)},`
    : "Hi,";
  const baseUrl = await getEmailBaseUrl();
  const relistUrl = `${baseUrl}/dresses/${row.dress_id}/relist`;

  const result = await sendEmail({
    to: row.owner_email,
    subject: `Still got that ${dressLabel}? Pass it on.`,
    html: emailLayout({
      preheader: `Re-list it on frockd so the next person can wear it.`,
      heading: "Time to pass it on?",
      body: `
        <p>${greeting}</p>
        <p>About three months ago you bought <strong>${escapeHtml(dressLabel)}</strong> on frockd. If the event has been and gone, someone else is probably looking for exactly this dress right now.</p>
        <p>Re-listing takes a few minutes — most of the details are already on file from when you bought it.</p>
        <p style="margin:24px 0;">
          <a href="${relistUrl}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">List it again</a>
        </p>
        <p style="font-size:13px;color:#7a7470;">Or paste this into your browser:<br>
          <span style="word-break:break-all;">${escapeHtml(relistUrl)}</span>
        </p>
        <p style="font-size:13px;color:#7a7470;">Keeping it forever? No worries — we'll stop nudging once you start a new listing for this dress.</p>
      `,
    }),
    text: `${greeting.replace(/<[^>]+>/g, "")}\n\nAbout three months ago you bought ${dressLabel} on frockd. If the event has been and gone, someone else is probably looking for exactly this dress right now.\n\nRe-list it: ${relistUrl}`,
  });

  if (!result.ok) {
    return { ok: false, reason: "send-failed", detail: result.error };
  }

  // Roll the timestamps forward: mark this nudge sent, schedule
  // the next one 60 days out. Owner can stop nudges by relisting
  // (-> disposition='available') or marking 'kept' on the relist
  // landing page.
  await query(
    `UPDATE dresses
        SET last_relist_nudge_sent_at = NOW(),
            next_relist_nudge_at      = NOW() + INTERVAL '60 days'
      WHERE id = $1::bigint`,
    [row.dress_id],
  );

  return { ok: true };
}

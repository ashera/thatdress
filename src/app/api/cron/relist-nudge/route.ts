import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 200;

type Row = {
  dress_id: string;
  owner_email: string | null;
  owner_first_name: string | null;
  designer_name: string | null;
  model: string | null;
  // Title of the listing the dress was sold via — handy email subject hook.
  via_title: string | null;
};

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let rows: Row[];
  try {
    const r = await query<Row>(
      `SELECT d.id::text                              AS dress_id,
              u.email                                  AS owner_email,
              u.first_name                             AS owner_first_name,
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
         JOIN users     u   ON u.id = d.current_owner_user_id
         LEFT JOIN designers des ON des.id = d.designer_id
        WHERE d.disposition = 'in-use'
          AND d.next_relist_nudge_at IS NOT NULL
          AND d.next_relist_nudge_at <= NOW()
          AND (
            d.last_relist_nudge_sent_at IS NULL
            OR d.last_relist_nudge_sent_at < NOW() - INTERVAL '60 days'
          )
          AND u.suspended_at IS NULL
          AND u.email_verified_at IS NOT NULL
        ORDER BY d.next_relist_nudge_at
        LIMIT $1`,
      [BATCH_LIMIT],
    );
    rows = r.rows;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "db error" },
      { status: 500 },
    );
  }

  const baseUrl = await getEmailBaseUrl();
  const stats = { candidates: rows.length, sent: 0, errors: 0 };

  for (const row of rows) {
    try {
      if (!row.owner_email) continue;

      const dressLabel =
        [row.designer_name, row.model].filter(Boolean).join(" ") ||
        row.via_title ||
        "your frockd dress";
      const greeting = row.owner_first_name
        ? `Hi ${escapeHtml(row.owner_first_name)},`
        : "Hi,";
      const relistUrl = `${baseUrl}/listings/mine`;

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
        stats.errors++;
        // eslint-disable-next-line no-console
        console.error(
          "[cron/relist-nudge] send failed",
          row.dress_id,
          result.error,
        );
        continue;
      }

      // Roll the timestamps forward: mark this nudge sent, schedule
      // the next one 60 days out. Owner can cut nudges off by
      // relisting (-> disposition='available') or by Phase-4 'kept'.
      await query(
        `UPDATE dresses
            SET last_relist_nudge_sent_at = NOW(),
                next_relist_nudge_at      = NOW() + INTERVAL '60 days'
          WHERE id = $1::bigint`,
        [row.dress_id],
      );
      stats.sent++;
    } catch (e) {
      stats.errors++;
      // eslint-disable-next-line no-console
      console.error("[cron/relist-nudge] failed", row.dress_id, e);
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

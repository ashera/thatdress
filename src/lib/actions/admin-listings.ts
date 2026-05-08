"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

/**
 * Admin force-fires the sale-nudge prompt for a listing — emails the
 * seller asking 'is this still available?' and stamps
 * last_sale_nudge_sent_at so the in-app banner on /listings/mine
 * shows up regardless of how recently the listing was created.
 *
 * Useful when an admin spots an obviously-stale listing (someone
 * messaged about it weeks ago, conversation went cold) and wants to
 * push the seller to either confirm or close it out without waiting
 * for the auto-timer.
 */
export async function sendSaleNudge(formData: FormData): Promise<void> {
  await requireAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) {
    redirect("/admin/listings?nudge=invalid");
  }

  // Pull seller + title together — one round-trip, the title is for
  // the email body and the seller email is the recipient.
  const r = await query<{
    title: string;
    seller_email: string | null;
    is_published: boolean;
    sold_at: string | null;
    is_draft: boolean;
  }>(
    `SELECT l.title,
            l.is_published,
            l.sold_at::text,
            l.is_draft,
            u.email AS seller_email
       FROM listings l
       LEFT JOIN users u ON u.id = l.seller_id
      WHERE l.id = $1::bigint
      LIMIT 1`,
    [listingId],
  );
  const row = r.rows[0];
  if (!row) redirect("/admin/listings?nudge=not-found");
  if (row.is_draft || row.sold_at || !row.is_published) {
    // Nudging a draft / sold / hidden listing makes no sense — refuse
    // rather than silently update the timer.
    redirect("/admin/listings?nudge=not-eligible");
  }
  if (!row.seller_email) {
    redirect("/admin/listings?nudge=no-seller");
  }

  // Stamp the timer first so the in-app banner shows even if the
  // email send fails (Resend down, key missing, etc.).
  await query(
    `UPDATE listings
        SET last_sale_nudge_sent_at = NOW()
      WHERE id = $1::bigint`,
    [listingId],
  );

  const baseUrl = await getEmailBaseUrl();
  const url = `${baseUrl}/listings/mine`;
  await sendEmail({
    to: row.seller_email,
    subject: `frockd — is your ${row.title} still for sale?`,
    html: emailLayout({
      preheader: `Quick check on your '${row.title}' listing.`,
      heading: "Is your dress still for sale?",
      body: `
        <p>Hi — we want to keep frockd&rsquo;s inventory fresh, so we&rsquo;re checking in on your listing for <strong>${escapeHtml(row.title)}</strong>.</p>
        <p>If it&rsquo;s still available, hit <strong>Still for sale</strong> in your dashboard. If it&rsquo;s sold (here or elsewhere), mark it sold so other buyers can move on.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Open my listings</a>
        </p>
        <p style="font-size:13px;color:#7a7470;">Or paste this into your browser:<br>
          <span style="word-break:break-all;">${escapeHtml(url)}</span>
        </p>
      `,
    }),
    text: `Hi — quick check on your frockd listing for "${row.title}". If it's still for sale, tap "Still for sale" in your dashboard. If it's sold, mark it sold so other buyers can move on.\n\nOpen your listings: ${url}`,
  });

  revalidatePath("/admin/listings");
  revalidatePath("/listings/mine");
  redirect("/admin/listings?nudge=sent");
}

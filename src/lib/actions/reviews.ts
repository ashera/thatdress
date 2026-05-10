"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  consumeReviewToken,
  issueReviewToken,
  lookupReviewToken,
} from "@/lib/reviews";
import {
  emailLayout,
  escapeHtml,
  getEmailBaseUrl,
  sendEmail,
} from "@/lib/email";

const BODY_MAX = 500;

async function canEditListing(
  listingId: string,
  user: { id: string; isAdmin: boolean },
): Promise<{ ok: boolean; sellerId: string | null }> {
  if (!/^\d+$/.test(listingId)) return { ok: false, sellerId: null };
  const r = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const sellerId = r.rows[0]?.seller_id ?? null;
  if (!sellerId) return { ok: false, sellerId: null };
  return { ok: user.isAdmin || sellerId === user.id, sellerId };
}

/**
 * Mark a listing sold, optionally attributing the sale to a specific
 * buyer (picked from the listing's conversations on the seller-side
 * dialog). When a buyer is attributed, we also issue a review token
 * and email the buyer asking them to rate the seller.
 *
 * 'Sold elsewhere' is the no-buyer path — same DB write minus the
 * sold_to_user_id stamp and the review email.
 */
export async function closeListingWithBuyer(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  const auth = await canEditListing(listingId, user);
  if (!auth.ok) redirect("/listings/mine");

  const buyerIdRaw = String(formData.get("buyerId") ?? "");
  const buyerId = /^\d+$/.test(buyerIdRaw) ? buyerIdRaw : null;
  // Whether to redirect to /listings/mine (default) or back to the
  // detail page. Forms on each surface set this hidden field.
  const next = String(formData.get("next") ?? "/listings/mine");

  if (buyerId) {
    // Verify the picked buyer has actually conversed about this
    // listing — stops a malicious seller stamping random user ids.
    const v = await query<{ ok: boolean }>(
      `SELECT TRUE AS ok FROM conversations
        WHERE listing_id = $1::bigint
          AND buyer_id   = $2::bigint
        LIMIT 1`,
      [listingId, buyerId],
    );
    if (!v.rows[0]) redirect("/listings/mine?sold=invalid-buyer");
  }

  await query(
    `UPDATE listings
        SET sold_at         = NOW(),
            sold_to_user_id = $2::bigint
      WHERE id = $1::bigint`,
    [listingId, buyerId],
  );

  // Phase 2 ownership transfer. Resolve the dress + seller from the
  // listing, then either hand the dress to the attributed buyer
  // ('in-use') or mark it as gone to an unknown buyer ('lost').
  // Both branches append an event to dress_ownership_events so the
  // provenance trail (Phase 5) and the relist nudge job (Phase 3)
  // can reconstruct who has the dress.
  const dressLookup = await query<{
    dress_id: string;
    seller_id: string;
  }>(
    `SELECT dress_id::text, seller_id::text
       FROM listings
      WHERE id = $1::bigint
      LIMIT 1`,
    [listingId],
  );
  const dressRow = dressLookup.rows[0];
  if (dressRow) {
    if (buyerId) {
      // Schedule the first relist nudge for 90 days post-sale. Most
      // formal events are within ~10 weeks of purchase, so by 90d the
      // dress has usually been worn and the buyer is open to relisting.
      // The Phase 3 cron route /api/cron/relist-nudge consumes this.
      await query(
        `UPDATE dresses
            SET current_owner_user_id    = $2::bigint,
                disposition              = 'in-use',
                next_relist_nudge_at     = NOW() + INTERVAL '90 days',
                last_relist_nudge_sent_at = NULL
          WHERE id = $1::bigint`,
        [dressRow.dress_id, buyerId],
      );
      await query(
        `INSERT INTO dress_ownership_events
           (dress_id, from_user_id, to_user_id, via_listing_id, event_type)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, 'sold')`,
        [dressRow.dress_id, dressRow.seller_id, buyerId, listingId],
      );
    } else {
      await query(
        `UPDATE dresses
            SET disposition = 'lost'
          WHERE id = $1::bigint`,
        [dressRow.dress_id],
      );
      await query(
        `INSERT INTO dress_ownership_events
           (dress_id, from_user_id, via_listing_id, event_type)
         VALUES ($1::bigint, $2::bigint, $3::bigint, 'sold-elsewhere')`,
        [dressRow.dress_id, dressRow.seller_id, listingId],
      );
    }
  }

  if (buyerId) {
    // Issue token, email the buyer with the review link. Both side
    // effects are wrapped in a try/catch — a Resend outage shouldn't
    // block the sale-close action.
    try {
      const token = await issueReviewToken(listingId, buyerId);
      const baseUrl = await getEmailBaseUrl();
      const url = `${baseUrl}/listings/${listingId}/review/${token}`;

      const buyer = await query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1::bigint LIMIT 1`,
        [buyerId],
      );
      const buyerEmail = buyer.rows[0]?.email;
      const titleRow = await query<{ title: string }>(
        `SELECT title FROM listings WHERE id = $1::bigint LIMIT 1`,
        [listingId],
      );
      const title = titleRow.rows[0]?.title ?? "your purchase";

      if (buyerEmail) {
        await sendEmail({
          to: buyerEmail,
          subject: `How did your ${title} purchase go?`,
          html: emailLayout({
            preheader: `Quick review prompt for your frockd purchase.`,
            heading: "How did it go?",
            body: `
              <p>The seller just marked <strong>${escapeHtml(title)}</strong> as sold to you on frockd. We&rsquo;d love a quick review — stars, an optional comment, three yes/no chips. Takes about 30 seconds.</p>
              <p>Reviews live on the seller&rsquo;s public profile and help future buyers know what to expect.</p>
              <p style="margin:24px 0;">
                <a href="${url}" style="display:inline-block;background:#1c1816;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;">Leave a review</a>
              </p>
              <p style="font-size:13px;color:#7a7470;">Or paste this into your browser:<br>
                <span style="word-break:break-all;">${escapeHtml(url)}</span>
              </p>
              <p style="font-size:13px;color:#7a7470;">If you didn&rsquo;t buy this dress, you can ignore this email — the link expires after 60 days.</p>
            `,
          }),
          text: `How did your ${title} purchase go on frockd? Leave a quick review at ${url}\n\nIf you didn't buy this, you can ignore this email.`,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[review] dispatch failed", e);
    }
  }

  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/listings");
  revalidatePath("/");
  revalidatePath("/listings/mine");
  redirect(next);
}

/**
 * Submit a review using the tokenised email link. The form posts
 * listingId + token + the rating fields; we look up the token, verify
 * the visitor is logged in as the same buyer the token was issued
 * for, then upsert the listing_reviews row and consume the token.
 */
export async function submitListingReview(
  formData: FormData,
): Promise<void> {
  const user = await getCurrentUser();
  const listingId = String(formData.get("listingId") ?? "");
  const token = String(formData.get("token") ?? "");

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/listings/${listingId}/review/${token}`)}`,
    );
  }

  const lookup = await lookupReviewToken(token);
  if (!lookup.ok) {
    redirect(`/listings/${listingId}?review-error=${lookup.reason}`);
  }
  if (lookup.listingId !== listingId) {
    redirect(`/listings/${listingId}?review-error=mismatch`);
  }
  if (lookup.buyerId !== user.id) {
    redirect(`/listings/${listingId}?review-error=wrong-account`);
  }

  // Validate inputs.
  const stars = Number.parseInt(String(formData.get("stars") ?? ""), 10);
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    redirect(
      `/listings/${listingId}/review/${token}?error=invalid-stars`,
    );
  }
  const body =
    String(formData.get("body") ?? "").trim().slice(0, BODY_MAX) || null;
  const asDescribed = readNullableBool(formData, "as_described");
  const easyComm = readNullableBool(formData, "easy_communication");
  const smoothHandover = readNullableBool(formData, "smooth_handover");

  // Look up seller_id for the row.
  const sellerR = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
    [listingId],
  );
  const sellerId = sellerR.rows[0]?.seller_id;
  if (!sellerId) redirect(`/listings/${listingId}?review-error=invalid`);
  if (sellerId === user.id) {
    // Edge case: somehow a seller got the token. Refuse.
    redirect(`/listings/${listingId}?review-error=self-review`);
  }

  // Edit-window lock: if there's already a review for this
  // (listing, buyer) pair and it's older than 7 days, refuse the
  // upsert. Stops revenge-edits when a follow-up dispute goes south
  // and prevents a future edit-my-review UI from violating the window.
  const existing = await query<{ created_at: string }>(
    `SELECT created_at::text FROM listing_reviews
      WHERE listing_id = $1::bigint
        AND buyer_id   = $2::bigint
      LIMIT 1`,
    [listingId, user.id],
  );
  if (existing.rows[0]) {
    const ageMs =
      Date.now() - new Date(existing.rows[0].created_at).getTime();
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      redirect(`/listings/${listingId}/review/${token}?error=locked`);
    }
  }

  // Upsert — second submission against the same (listing, buyer) pair
  // edits the existing review.
  await query(
    `INSERT INTO listing_reviews
        (listing_id, seller_id, buyer_id, stars, body,
         as_described, easy_communication, smooth_handover)
     VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, $7, $8)
     ON CONFLICT (listing_id, buyer_id) DO UPDATE SET
        stars = EXCLUDED.stars,
        body  = EXCLUDED.body,
        as_described       = EXCLUDED.as_described,
        easy_communication = EXCLUDED.easy_communication,
        smooth_handover    = EXCLUDED.smooth_handover,
        edited_at          = NOW()`,
    [
      listingId,
      sellerId,
      user.id,
      stars,
      body,
      asDescribed,
      easyComm,
      smoothHandover,
    ],
  );

  await consumeReviewToken(lookup.tokenId);

  revalidatePath(`/sellers/${sellerId}`);
  redirect(`/sellers/${sellerId}?review=submitted`);
}

function readNullableBool(formData: FormData, name: string): boolean | null {
  const raw = formData.get(name);
  if (raw === "yes") return true;
  if (raw === "no") return false;
  return null;
}

const FLAG_REASON_MAX = 500;

/** Seller flags a review they think is unfair. Stamps flagged_at +
 *  flag_reason on the listing_reviews row and surfaces it in the
 *  admin moderation queue at /admin/reviews. The review stays
 *  visible until an admin acts — flag is just a request for review,
 *  not an automatic hide. */
export async function flagSellerReview(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reviewId = String(formData.get("reviewId") ?? "");
  if (!/^\d+$/.test(reviewId)) redirect("/");

  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, FLAG_REASON_MAX);
  if (!reason) redirect(`/sellers/${user.id}?flag=missing-reason`);

  // Only the seller of the review can flag it.
  const r = await query<{ seller_id: string }>(
    `SELECT seller_id::text FROM listing_reviews WHERE id = $1::bigint LIMIT 1`,
    [reviewId],
  );
  const sellerId = r.rows[0]?.seller_id;
  if (!sellerId) redirect("/");
  if (sellerId !== user.id) redirect(`/sellers/${sellerId}`);

  await query(
    `UPDATE listing_reviews
        SET flagged_at  = NOW(),
            flag_reason = $2
      WHERE id = $1::bigint`,
    [reviewId, reason],
  );

  revalidatePath(`/sellers/${sellerId}`);
  revalidatePath("/admin/reviews");
  redirect(`/sellers/${sellerId}?flag=submitted`);
}

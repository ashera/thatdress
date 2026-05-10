import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db";

const TOKEN_TTL_DAYS = 60;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

export type ReviewSummary = {
  count: number;
  /** Average stars, 0 when no reviews. Caller can hide the badge in
   *  that case rather than rendering '0 / 5'. */
  average: number;
};

export type ReviewRow = {
  id: string;
  buyer_id: string;
  buyer_email: string;
  listing_id: string;
  listing_title: string;
  stars: number;
  body: string | null;
  as_described: boolean | null;
  easy_communication: boolean | null;
  smooth_handover: boolean | null;
  created_at: string;
  edited_at: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Issue a review token for a buyer-listing pair, persist its hash,
 *  and return the plaintext token (only ever returned here — it goes
 *  straight into the email link and is then forgotten). Replaces any
 *  existing unused token for the same pair so we don't leave stale
 *  links live if the seller re-attributes. */
export async function issueReviewToken(
  listingId: string,
  buyerId: string,
): Promise<string> {
  const token = generateReviewToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await query(
    `UPDATE listing_review_tokens
        SET used_at = NOW()
      WHERE listing_id = $1::bigint
        AND buyer_id   = $2::bigint
        AND used_at IS NULL`,
    [listingId, buyerId],
  );
  await query(
    `INSERT INTO listing_review_tokens
       (listing_id, buyer_id, token_hash, expires_at)
     VALUES ($1::bigint, $2::bigint, $3, $4)`,
    [listingId, buyerId, hashToken(token), expiresAt],
  );
  return token;
}

export type TokenLookup =
  | {
      ok: true;
      listingId: string;
      buyerId: string;
      tokenId: string;
    }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Resolve a plaintext token to its listing+buyer pair. Used by the
 *  review form page to authorise the visitor. */
export async function lookupReviewToken(
  rawToken: string,
): Promise<TokenLookup> {
  if (!rawToken || typeof rawToken !== "string") {
    return { ok: false, reason: "invalid" };
  }
  const r = await query<{
    id: string;
    listing_id: string;
    buyer_id: string;
    used_at: string | null;
    expired: boolean;
  }>(
    `SELECT id::text,
            listing_id::text,
            buyer_id::text,
            used_at::text,
            (expires_at <= NOW()) AS expired
       FROM listing_review_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [hashToken(rawToken)],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (row.expired) return { ok: false, reason: "expired" };
  return {
    ok: true,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    tokenId: row.id,
  };
}

export async function consumeReviewToken(tokenId: string): Promise<void> {
  await query(
    `UPDATE listing_review_tokens
        SET used_at = NOW()
      WHERE id = $1::bigint`,
    [tokenId],
  );
}

/** Average + count for a seller, ignoring admin-hidden reviews. */
export async function getSellerReviewSummary(
  sellerId: string,
): Promise<ReviewSummary> {
  if (!/^\d+$/.test(sellerId)) return { count: 0, average: 0 };
  try {
    const r = await query<{ count: string; average: string | null }>(
      `SELECT COUNT(*)::text                   AS count,
              ROUND(AVG(stars)::numeric, 1)::text AS average
         FROM listing_reviews
        WHERE seller_id = $1::bigint
          AND hidden_by_admin_at IS NULL`,
      [sellerId],
    );
    const row = r.rows[0];
    return {
      count: Number(row?.count ?? 0),
      average: Number(row?.average ?? 0),
    };
  } catch {
    return { count: 0, average: 0 };
  }
}

export async function listSellerReviews(
  sellerId: string,
  limit = 20,
): Promise<ReviewRow[]> {
  if (!/^\d+$/.test(sellerId)) return [];
  try {
    const r = await query<ReviewRow>(
      `SELECT r.id::text,
              r.buyer_id::text,
              u.email                AS buyer_email,
              r.listing_id::text,
              l.title                AS listing_title,
              r.stars,
              r.body,
              r.as_described,
              r.easy_communication,
              r.smooth_handover,
              r.created_at::text,
              r.edited_at::text
         FROM listing_reviews r
         LEFT JOIN users    u ON u.id = r.buyer_id
         LEFT JOIN listings l ON l.id = r.listing_id
        WHERE r.seller_id = $1::bigint
          AND r.hidden_by_admin_at IS NULL
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [sellerId, limit],
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** Mask an email for public display: 'al●●●@gmail.com'. Same shape
 *  as the referrer dashboard so reviews look consistent with the
 *  rest of the trust UI. */
export function maskBuyerEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"●".repeat(Math.max(2, local.length - 2))}${domain}`;
}

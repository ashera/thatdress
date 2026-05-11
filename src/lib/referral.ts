import "server-only";
import { randomBytes } from "node:crypto";
import { query } from "@/lib/db";

/** Length of the public-facing referral code. 8 chars of base32-ish
 *  alphabet gives ~10^12 codes — comfortable for a long-tail referral
 *  programme, short enough to type if a friend gets the URL by phone. */
const CODE_LENGTH = 8;
/** Crockford's base32 minus 'O', '0', 'I', '1' to remove ambiguous
 *  glyphs ('O'/'0', 'I'/'1', etc.) that could trip up someone copying
 *  a code by hand. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const REFERRAL_COOKIE = "frockd_ref";
export const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Read a user's referral_code, generating + persisting one on first
 *  call if their row is missing it. Idempotent and race-tolerant —
 *  unique-violation on the partial index just means a parallel call
 *  beat us to it; we re-read in that case. */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  if (!/^\d+$/.test(userId)) return null;

  const existing = await query<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $1::bigint LIMIT 1`,
    [userId],
  );
  const current = existing.rows[0]?.referral_code;
  if (current) return current;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const updated = await query<{ referral_code: string | null }>(
        `UPDATE users
            SET referral_code = $2
          WHERE id = $1::bigint
            AND referral_code IS NULL
          RETURNING referral_code`,
        [userId, code],
      );
      if (updated.rows[0]?.referral_code) return updated.rows[0].referral_code;
      // No row returned → another writer set it concurrently. Re-read.
      const reread = await query<{ referral_code: string | null }>(
        `SELECT referral_code FROM users WHERE id = $1::bigint LIMIT 1`,
        [userId],
      );
      if (reread.rows[0]?.referral_code) return reread.rows[0].referral_code;
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") throw err;
      // Code collision against a different user — retry with a fresh code.
    }
  }
  return null;
}

/** Look up a user by referral code (case-insensitive, trimmed). Returns
 *  the referrer's id, or null if no match / the code is malformed.
 *
 *  Accepts the full alphanumeric range A-Z 0-9. Newly-generated codes
 *  use the Crockford-style ALPHABET (no 0/1 to avoid hand-typing
 *  ambiguity), but the schema's MD5-prefix backfill seeds existing
 *  users with codes that can contain any hex digit including 0 and 1.
 *  Tightening this regex to ALPHABET-only would silently drop those
 *  referrals — match anything alphanumeric so both flows work. */
export async function findReferrerByCode(
  rawCode: string,
): Promise<string | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return null;
  const r = await query<{ id: string }>(
    `SELECT id::text FROM users
      WHERE referral_code = $1
        AND suspended_at IS NULL
      LIMIT 1`,
    [code],
  );
  return r.rows[0]?.id ?? null;
}

/**
 * Count of friends this user has referred who have at least one
 * Verified, non-draft listing on file. Drives the tier badge on
 * /profile/refer and the avatar pill in the nav. Returns 0 on
 * any DB failure rather than throwing — callers fall back to no
 * tier indicator.
 */
export async function countFriendsListed(userId: string): Promise<number> {
  if (!/^\d+$/.test(userId)) return 0;
  try {
    const r = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT u.id)::text AS count
         FROM users u
        WHERE u.referred_by_user_id = $1::bigint
          AND EXISTS (
            SELECT 1 FROM listings l
             WHERE l.seller_id    = u.id
               AND l.trust_status = 'verified'
               AND l.is_draft     = FALSE
          )`,
      [userId],
    );
    return Number(r.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export type ReferrerDisplay = {
  /** Normalised alphanumeric form, e.g. SARAHK. Surfaced in the
   *  footer in brackets so the visitor can verify the code matches
   *  the one their referrer sent. */
  code: string;
  /** Referrer's first name, when set. Falls back to the local-part
   *  of their email when it isn't. */
  displayName: string;
};

/**
 * Resolve a referral code into a footer-ready display row
 * (first name + canonical code). Returns null when the code
 * doesn't match an active user — callers should silently hide
 * the footer chip in that case rather than surfacing 'invalid
 * code' to the visitor.
 */
export async function lookupReferrerDisplay(
  rawCode: string,
): Promise<ReferrerDisplay | null> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return null;
  try {
    const r = await query<{ first_name: string | null; email: string | null }>(
      `SELECT first_name, email FROM users
        WHERE referral_code = $1
          AND suspended_at IS NULL
        LIMIT 1`,
      [code],
    );
    const row = r.rows[0];
    if (!row) return null;
    const name = row.first_name?.trim();
    const fallback = row.email?.split("@")[0] ?? "A frockd member";
    return {
      code,
      displayName: name && name.length > 0 ? name : fallback,
    };
  } catch {
    return null;
  }
}

export type ReferredUser = {
  id: string;
  email: string;
  signed_up_at: string;
  /** All non-draft listings the referred user has on file. */
  listing_count: number;
  /** Count of those listings currently in trust_status='verified' —
   *  the multiplier applied to the per-listing commission rate. */
  verified_listing_count: number;
};

/** All users who signed up with the given referrer's code, with the
 *  per-user listing counts the dashboard uses to compute per-row
 *  commission. */
export async function listReferredUsers(
  referrerId: string,
): Promise<ReferredUser[]> {
  if (!/^\d+$/.test(referrerId)) return [];
  const r = await query<{
    id: string;
    email: string;
    signed_up_at: string;
    listing_count: string;
    verified_count: string;
  }>(
    `SELECT u.id::text,
            u.email,
            COALESCE(u.referred_at, u.created_at)::text AS signed_up_at,
            (SELECT COUNT(*)::text FROM listings
                WHERE seller_id = u.id
                  AND is_draft = FALSE) AS listing_count,
            (SELECT COUNT(*)::text FROM listings
                WHERE seller_id = u.id
                  AND trust_status = 'verified'
                  AND is_draft = FALSE) AS verified_count
       FROM users u
      WHERE u.referred_by_user_id = $1::bigint
      ORDER BY COALESCE(u.referred_at, u.created_at) DESC`,
    [referrerId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    email: row.email,
    signed_up_at: row.signed_up_at,
    listing_count: Number(row.listing_count ?? 0),
    verified_listing_count: Number(row.verified_count ?? 0),
  }));
}

export type ReferralSummary = {
  totalReferred: number;
  /** Total Verified listings across every referred user — the
   *  per-listing earnings multiplier. */
  totalVerifiedListings: number;
};

export async function getReferralSummary(
  referrerId: string,
): Promise<ReferralSummary> {
  if (!/^\d+$/.test(referrerId)) {
    return { totalReferred: 0, totalVerifiedListings: 0 };
  }
  const r = await query<{ total: string; verified_listings: string }>(
    `SELECT
        COUNT(DISTINCT u.id)::text AS total,
        COALESCE(SUM(
          (SELECT COUNT(*) FROM listings
             WHERE seller_id = u.id
               AND trust_status = 'verified'
               AND is_draft = FALSE)
        ), 0)::text AS verified_listings
       FROM users u
      WHERE u.referred_by_user_id = $1::bigint`,
    [referrerId],
  );
  const row = r.rows[0];
  return {
    totalReferred: Number(row?.total ?? 0),
    totalVerifiedListings: Number(row?.verified_listings ?? 0),
  };
}

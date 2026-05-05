/**
 * Trust-status auto-elevation logic. Pure function — no DB. Called
 * from the listing publish + edit actions to derive the listing's
 * trust_status from its current state.
 *
 * Ladder:
 *   self-declared  – default. Seller has (or hasn't) ticked the
 *                    authenticity box; nothing else qualifies.
 *   verified       – auto-elevated when health score is high enough,
 *                    seller has declared authenticity AND label/lining
 *                    photos, and the listing has at least 3 photos.
 *                    Earns the public Verified badge.
 *   authenticated  – reserved for a future third-party verification
 *                    partnership; not auto-set today.
 *   flagged        – set by admin when a buyer report is upheld;
 *                    suppresses any verified badge.
 */

import {
  HEALTH_THRESHOLD_VERIFIED,
  type HealthInput,
  computeHealth,
} from "@/lib/listing-health";

export type TrustStatus =
  | "self-declared"
  | "verified"
  | "authenticated"
  | "flagged";

export const TRUST_BADGE_LABELS: Record<TrustStatus, string> = {
  "self-declared": "Self-confirmed",
  verified: "Verified",
  authenticated: "Authenticated",
  flagged: "Flagged",
};

/**
 * Compute the trust_status a listing should have based on its current
 * fields. Never overrides 'authenticated' or 'flagged' — those are
 * admin-managed states.
 *
 * Threshold defaults to the constant in listing-health.ts but callers
 * (server actions) should pass the live value from site_settings so
 * admin tweaks take effect immediately.
 */
export function deriveTrustStatus(opts: {
  current: TrustStatus;
  health: HealthInput;
  /** 0-100 score required to qualify for verified. */
  threshold?: number;
}): TrustStatus {
  const { current, threshold = HEALTH_THRESHOLD_VERIFIED } = opts;

  // Admin-managed states win. Don't auto-demote 'flagged' or override
  // a future 'authenticated' partnership badge.
  if (current === "flagged" || current === "authenticated") {
    return current;
  }

  const { score } = computeHealth(opts.health);
  const eligibleForVerified =
    opts.health.isAuthenticDeclared &&
    opts.health.includesLabelLiningPhotos &&
    opts.health.imageCount >= 3 &&
    score >= threshold;

  return eligibleForVerified ? "verified" : "self-declared";
}

export function isTrustStatus(value: string): value is TrustStatus {
  return (
    value === "self-declared" ||
    value === "verified" ||
    value === "authenticated" ||
    value === "flagged"
  );
}

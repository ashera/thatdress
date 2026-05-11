/**
 * Shared tier definitions for the referral programme. Pure data,
 * no server-only imports, safe to use in client components.
 *
 * Metric is 'friends who've posted ≥1 Verified listing' — the
 * same value /profile/refer already computes from the referrals
 * list. Tiers are status-only (recognition, not cash); concrete
 * perks can be wired behind the same thresholds later without
 * changing the bar's shape.
 */

export type ReferralTier = {
  threshold: number;
  emoji: string;
  label: string;
  blurb: string;
};

export const REFERRAL_TIERS: ReferralTier[] = [
  {
    threshold: 1,
    emoji: "🌱",
    label: "First connection",
    blurb: "One friend on frockd is the hardest one to land. You're past it.",
  },
  {
    threshold: 3,
    emoji: "🌟",
    label: "Connector",
    blurb: "Three friends listing means it's not a fluke — your taste is good.",
  },
  {
    threshold: 5,
    emoji: "💎",
    label: "Tastemaker",
    blurb: "Five friends. You've moved the marketplace forward in a meaningful way.",
  },
  {
    threshold: 10,
    emoji: "👑",
    label: "Insider",
    blurb: "Ten friends listing because of you. Top of the leaderboard kind of impact.",
  },
];

export const REFERRAL_TIER_TOP = REFERRAL_TIERS[REFERRAL_TIERS.length - 1]!.threshold;

/** Highest tier reached for a given friends-listed count, or null. */
export function currentReferralTier(
  friendsListed: number,
): ReferralTier | null {
  let hit: ReferralTier | null = null;
  for (const tier of REFERRAL_TIERS) {
    if (friendsListed >= tier.threshold) hit = tier;
  }
  return hit;
}

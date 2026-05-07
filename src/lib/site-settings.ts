import "server-only";
import { query } from "@/lib/db";

export type SiteSettings = {
  /** Master switch for search-engine indexing. When false the site
   *  emits robots: noindex,nofollow on every page and Disallow:/ in
   *  /robots.txt. Default false so new deployments are blocked until
   *  an admin explicitly opens them up. */
  allowIndexing: boolean;
  /** Listing-health score (0-100) above which a listing auto-elevates
   *  to trust_status='verified'. Default 75. Tweak to balance
   *  achievable-by-most-sellers vs the credibility of the badge. */
  healthThresholdVerified: number;
  /** Referral commission in AUD cents, paid to the referrer for each
   *  friend who signs up via their link AND then posts at least one
   *  Verified listing. Default 0 — no payouts until an admin sets a
   *  rate. Always uses the *current* rate when computing earnings;
   *  changing it retroactively affects already-attributed referrals. */
  referralCommissionCents: number;
  /** When the site enters maintenance mode. ISO timestamp string, or
   *  null when nothing is scheduled. A future value means a countdown
   *  is showing on every page. A past value means maintenance is
   *  active — non-admin users see the maintenance page; admins keep
   *  working. */
  maintenanceAt: string | null;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  allowIndexing: false,
  healthThresholdVerified: 75,
  referralCommissionCents: 0,
  maintenanceAt: null,
};

type Row = {
  allow_indexing: boolean;
  health_threshold_verified: number;
  referral_commission_cents: number;
  maintenance_at: string | null;
};

export async function loadSiteSettings(): Promise<SiteSettings> {
  try {
    const r = await query<Row>(
      `SELECT allow_indexing,
              health_threshold_verified,
              referral_commission_cents,
              maintenance_at::text AS maintenance_at
         FROM site_settings WHERE id = 1 LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return DEFAULT_SITE_SETTINGS;
    return {
      allowIndexing: row.allow_indexing,
      healthThresholdVerified: row.health_threshold_verified,
      referralCommissionCents: row.referral_commission_cents,
      maintenanceAt: row.maintenance_at,
    };
  } catch {
    // If the DB is unreachable, fall safe (block indexing) so we don't
    // accidentally let crawlers in during an outage / migration.
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function updateSiteSettings(next: SiteSettings): Promise<void> {
  await query(
    `INSERT INTO site_settings (
        id,
        allow_indexing,
        health_threshold_verified,
        referral_commission_cents,
        updated_at
     ) VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       allow_indexing            = EXCLUDED.allow_indexing,
       health_threshold_verified = EXCLUDED.health_threshold_verified,
       referral_commission_cents = EXCLUDED.referral_commission_cents,
       updated_at                = NOW()`,
    [
      next.allowIndexing,
      next.healthThresholdVerified,
      next.referralCommissionCents,
    ],
  );
}

/** Set the maintenance window. Pass a Date to schedule (or activate
 *  immediately if the date is now or in the past), or null to clear
 *  any existing window. Independent of updateSiteSettings so the
 *  admin form for maintenance can fire repeatedly without re-asking
 *  for every other unrelated setting. */
export async function setMaintenanceAt(
  at: Date | null,
): Promise<void> {
  await query(
    `INSERT INTO site_settings (id, maintenance_at, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         maintenance_at = EXCLUDED.maintenance_at,
         updated_at     = NOW()`,
    [at],
  );
}

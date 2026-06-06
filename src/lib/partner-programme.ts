import "server-only";
import { query } from "@/lib/db";

/**
 * Partner Programme: a partner runs an exclusive marketing region. The
 * first 12 months are free; after that a platform fee — a percentage of
 * the listing fees the partner collects — applies. The rate is
 * snapshotted onto the region at activation, so changing this constant
 * never retroactively re-rates existing partners.
 */
export const PARTNER_PLATFORM_FEE_PCT = 10;
export const PARTNER_FREE_MONTHS = 12;

export type ApplyRegion = {
  id: string;
  label: string;
  taken: boolean;
  yours: boolean;
  pendingByYou: boolean;
};

/** Active regions with availability flags for the apply form. */
export async function getApplyRegions(userId: string): Promise<ApplyRegion[]> {
  try {
    const r = await query<{
      id: string;
      label: string;
      taken: boolean;
      yours: boolean;
      pending_by_you: boolean;
    }>(
      `SELECT r.id::text, r.label,
              (pmr.region_id IS NOT NULL)        AS taken,
              (pmr.user_id = $1::bigint)         AS yours,
              EXISTS (
                SELECT 1 FROM partner_applications a
                 WHERE a.region_id = r.id AND a.user_id = $1::bigint
                   AND a.status = 'pending'
              )                                  AS pending_by_you
         FROM regions r
         LEFT JOIN partner_marketing_regions pmr ON pmr.region_id = r.id
        WHERE r.is_active = TRUE
        ORDER BY r.sort_order, r.id`,
      [userId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      label: x.label,
      taken: x.taken,
      yours: x.yours,
      pendingByYou: x.pending_by_you,
    }));
  } catch {
    return [];
  }
}

export type MyApplication = {
  id: string;
  region_label: string;
  status: string;
  created_at: string;
  decision_note: string | null;
};

export async function getMyApplications(userId: string): Promise<MyApplication[]> {
  try {
    const r = await query<MyApplication>(
      `SELECT a.id::text, r.label AS region_label, a.status,
              a.created_at::text, a.decision_note
         FROM partner_applications a
         JOIN regions r ON r.id = a.region_id
        WHERE a.user_id = $1::bigint
        ORDER BY a.created_at DESC`,
      [userId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export type AdminApplication = {
  id: string;
  status: string;
  business_name: string | null;
  pitch: string | null;
  expected_inventory: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  region_id: string;
  region_label: string;
  user_id: string;
  user_email: string;
  region_taken: boolean;
  region_owner_email: string | null;
};

export async function listApplications(): Promise<AdminApplication[]> {
  try {
    const r = await query<AdminApplication>(
      `SELECT a.id::text, a.status, a.business_name, a.pitch,
              a.expected_inventory, a.created_at::text, a.decided_at::text,
              a.decision_note,
              r.id::text AS region_id, r.label AS region_label,
              u.id::text AS user_id, u.email AS user_email,
              (pmr.region_id IS NOT NULL) AS region_taken,
              owner.email AS region_owner_email
         FROM partner_applications a
         JOIN regions r ON r.id = a.region_id
         JOIN users u   ON u.id = a.user_id
         LEFT JOIN partner_marketing_regions pmr ON pmr.region_id = r.id
         LEFT JOIN users owner ON owner.id = pmr.user_id
        ORDER BY (a.status = 'pending') DESC, a.created_at DESC`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

export async function countPendingApplications(): Promise<number> {
  try {
    const r = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM partner_applications WHERE status = 'pending'`,
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

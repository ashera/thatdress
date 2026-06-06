"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

const APPLY = "/partners/apply";

function field(formData: FormData, key: string, max: number): string | null {
  const v = String(formData.get(key) ?? "").trim().slice(0, max);
  return v.length > 0 ? v : null;
}

/**
 * Submit a partner application for one region. Validates the region is
 * active and unclaimed; the partial unique index also blocks a duplicate
 * pending application for the same region by the same user.
 */
export async function applyForRegion(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(APPLY)}`);

  const regionId = String(formData.get("region_id") ?? "").trim();
  if (!/^\d+$/.test(regionId)) redirect(`${APPLY}?error=region`);

  const available = await query(
    `SELECT 1 FROM regions r
      WHERE r.id = $1::bigint AND r.is_active = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM partner_marketing_regions pmr WHERE pmr.region_id = r.id
        )
      LIMIT 1`,
    [regionId],
  );
  if (available.rows.length === 0) redirect(`${APPLY}?error=unavailable`);

  try {
    await query(
      `INSERT INTO partner_applications
         (user_id, region_id, business_name, pitch, expected_inventory)
       VALUES ($1::bigint, $2::bigint, $3, $4, $5)`,
      [
        user.id,
        regionId,
        field(formData, "business_name", 120),
        field(formData, "pitch", 2000),
        field(formData, "expected_inventory", 500),
      ],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      redirect(`${APPLY}?error=duplicate`);
    }
    throw e;
  }

  redirect(`${APPLY}?submitted=1`);
}

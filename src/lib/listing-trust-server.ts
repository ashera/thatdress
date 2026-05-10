import "server-only";
import { query } from "@/lib/db";
import { deriveTrustStatus, isTrustStatus } from "@/lib/listing-trust";
import { loadSiteSettings } from "@/lib/site-settings";

type ListingSnapshot = {
  designer_id: string | null;
  model: string | null;
  year: number | null;
  occasion_id: string | null;
  condition_id: string | null;
  size_id: string | null;
  silhouette_id: string | null;
  fabric_id: string | null;
  neckline_id: string | null;
  sleeve_style_id: string | null;
  length_id: string | null;
  color: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  original_retail_cents: number | null;
  has_original_receipt: boolean | null;
  is_authentic_declared: boolean | null;
  includes_label_lining_photos: boolean | null;
  description: string | null;
  trust_status: string | null;
  image_count: string;
};

function num(s: string | null): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Re-derive the trust_status for a listing from its current DB state
 * and write it back if the result differs. Called from every save
 * path (each wizard step action, image add/remove/reorder/set-primary,
 * the edit-form update) so the badge appears or disappears as soon
 * as the underlying criteria flip — not just when the seller hits
 * "Save changes" on the publish step.
 *
 * No-op when the new value matches the current value (avoids cache
 * churn and unnecessary writes). Won't override admin-managed states
 * because deriveTrustStatus refuses to change 'flagged' / 'authenticated'.
 */
export async function recomputeListingTrustStatus(
  listingId: string,
): Promise<void> {
  if (!/^\d+$/.test(listingId)) return;
  let row: ListingSnapshot | undefined;
  try {
    const r = await query<ListingSnapshot>(
      `SELECT dr.designer_id::text       AS designer_id,
              dr.model                   AS model,
              dr.year                    AS year,
              l.occasion_id::text       AS occasion_id,
              l.condition_id::text      AS condition_id,
              dr.size_id::text           AS size_id,
              dr.silhouette_id::text     AS silhouette_id,
              dr.fabric_id::text         AS fabric_id,
              dr.neckline_id::text       AS neckline_id,
              dr.sleeve_style_id::text   AS sleeve_style_id,
              dr.length_id::text         AS length_id,
              dr.color                   AS color,
              dr.bust_inches::text       AS bust_inches,
              dr.waist_inches::text      AS waist_inches,
              dr.hips_inches::text       AS hips_inches,
              dr.original_retail_cents   AS original_retail_cents,
              l.has_original_receipt    AS has_original_receipt,
              l.is_authentic_declared   AS is_authentic_declared,
              l.includes_label_lining_photos AS includes_label_lining_photos,
              l.description             AS description,
              l.trust_status            AS trust_status,
              (SELECT COUNT(*)::text FROM listing_images WHERE listing_id = l.id) AS image_count
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         WHERE l.id = $1::bigint LIMIT 1`,
      [listingId],
    );
    row = r.rows[0];
  } catch {
    return;
  }
  if (!row) return;

  const currentTrust =
    row.trust_status && isTrustStatus(row.trust_status)
      ? row.trust_status
      : "self-declared";

  const settings = await loadSiteSettings();
  const nextTrust = deriveTrustStatus({
    current: currentTrust,
    threshold: settings.healthThresholdVerified,
    health: {
      designerId: row.designer_id,
      model: row.model,
      year: row.year,
      occasionId: row.occasion_id,
      conditionId: row.condition_id,
      sizeId: row.size_id,
      silhouetteId: row.silhouette_id,
      fabricId: row.fabric_id,
      necklineId: row.neckline_id,
      sleeveStyleId: row.sleeve_style_id,
      lengthId: row.length_id,
      color: row.color,
      bustInches: num(row.bust_inches),
      waistInches: num(row.waist_inches),
      hipsInches: num(row.hips_inches),
      originalRetailCents: row.original_retail_cents,
      hasOriginalReceipt: !!row.has_original_receipt,
      isAuthenticDeclared: !!row.is_authentic_declared,
      includesLabelLiningPhotos: !!row.includes_label_lining_photos,
      description: row.description,
      imageCount: Number(row.image_count ?? 0),
    },
  });

  if (nextTrust !== currentTrust) {
    await query(
      `UPDATE listings SET trust_status = $1 WHERE id = $2::bigint`,
      [nextTrust, listingId],
    );
  }
}

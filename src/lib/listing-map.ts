import "server-only";
import { query } from "@/lib/db";
import type { MapPostcodeBucket } from "@/app/_components/listings-map";

/** Minimal listing shape needed to place a listing on the cluster map. */
export type MapListingRow = {
  id: string;
  title: string | null;
  price_cents: number;
  primary_image_id?: string | null;
  location_postal?: string | null;
};

/**
 * Group listings by normalised postcode, then look up each postcode's
 * centroid from the `postcodes` table. Listings whose postcode isn't in
 * the table are counted as off-map so the UI can prompt to expand the
 * seed. Result is shaped for direct consumption by <ListingsMap />.
 *
 * Privacy: markers land on the postcode centroid, never a seller's actual
 * address — same model as the location_postal field itself. Shared by the
 * public browse map and the partner region maps.
 */
export async function bucketByPostcode(
  listings: MapListingRow[],
): Promise<{ buckets: MapPostcodeBucket[]; offMapCount: number }> {
  type Pending = { postcode: string; listings: MapPostcodeBucket["listings"] };
  const byPostcode = new Map<string, Pending>();
  for (const l of listings) {
    const code = (l.location_postal ?? "").trim().toUpperCase();
    if (!code) continue;
    let bucket = byPostcode.get(code);
    if (!bucket) {
      bucket = { postcode: code, listings: [] };
      byPostcode.set(code, bucket);
    }
    bucket.listings.push({
      id: l.id,
      title: l.title ?? "",
      price_cents: l.price_cents,
      primary_image_id: l.primary_image_id ?? null,
    });
  }
  if (byPostcode.size === 0) return { buckets: [], offMapCount: 0 };

  const codes = Array.from(byPostcode.keys());
  let rows: {
    postcode: string;
    place_name: string | null;
    latitude: string;
    longitude: string;
  }[] = [];
  try {
    const r = await query<{
      postcode: string;
      place_name: string | null;
      latitude: string;
      longitude: string;
    }>(
      `SELECT postcode, place_name,
              latitude::text  AS latitude,
              longitude::text AS longitude
         FROM postcodes
        WHERE country_code = 'AU'
          AND postcode = ANY($1::text[])`,
      [codes],
    );
    rows = r.rows;
  } catch {
    rows = [];
  }
  const coords = new Map(rows.map((r) => [r.postcode, r]));
  const buckets: MapPostcodeBucket[] = [];
  let offMapCount = 0;
  for (const [code, b] of byPostcode) {
    const c = coords.get(code);
    if (!c) {
      offMapCount += b.listings.length;
      continue;
    }
    buckets.push({
      postcode: code,
      place_name: c.place_name,
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      listings: b.listings,
    });
  }
  return { buckets, offMapCount };
}

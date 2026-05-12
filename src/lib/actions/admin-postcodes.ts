"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AdmZip from "adm-zip";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

const GEONAMES_URL = "https://download.geonames.org/export/zip/AU.zip";
const BATCH_SIZE = 1000;

type ParsedRow = {
  postcode: string;
  placeName: string | null;
  latitude: number;
  longitude: number;
};

/**
 * Tab-separated GeoNames postal-code line layout:
 * 0  country_code   (e.g. AU)
 * 1  postal_code    (e.g. 2000)
 * 2  place_name     (e.g. Sydney)
 * 3  admin_name1    state name
 * 4  admin_code1
 * 5  admin_name2    county / region
 * 6  admin_code2
 * 7  admin_name3
 * 8  admin_code3
 * 9  latitude
 * 10 longitude
 * 11 accuracy
 *
 * We only need postcode, place_name, latitude, longitude. Bad rows
 * (missing coords, non-numeric, AU's stray '*' codes) get skipped.
 */
function parseAuText(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split("\t");
    if (cols.length < 11) continue;
    const postcode = cols[1]?.trim() ?? "";
    const placeName = cols[2]?.trim() ?? "";
    const latitude = Number.parseFloat(cols[9] ?? "");
    const longitude = Number.parseFloat(cols[10] ?? "");
    if (!postcode) continue;
    if (!/^[A-Z0-9]{3,8}$/i.test(postcode)) continue;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    rows.push({
      postcode: postcode.toUpperCase(),
      placeName: placeName || null,
      latitude,
      longitude,
    });
  }
  return rows;
}

/**
 * Admin-triggered import of the GeoNames AU postal-code dataset.
 * Pulls the AU.zip archive over HTTPS, unzips in memory, parses the
 * tab-separated AU.txt, and bulk-inserts via UNNEST so 12k rows
 * land in a handful of queries.
 *
 * `ON CONFLICT DO NOTHING` keeps the import idempotent — re-running
 * it never overwrites manual edits to existing rows.
 *
 * Returns counts via the redirect query string so the admin page
 * can display 'X rows imported, Y skipped (already present)'.
 */
export async function importGeoNamesAUPostcodes(): Promise<void> {
  await requireAdmin();

  let parsed: ParsedRow[] = [];
  let fetchedBytes = 0;
  try {
    const res = await fetch(GEONAMES_URL, {
      headers: { "User-Agent": "frockd-postcode-importer/1.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      redirect(`/admin/postcodes?error=fetch&status=${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fetchedBytes = buf.byteLength;
    const zip = new AdmZip(buf);
    const entry = zip.getEntry("AU.txt");
    if (!entry) {
      redirect("/admin/postcodes?error=no-au-txt");
    }
    const text = entry.getData().toString("utf-8");
    parsed = parseAuText(text);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin/postcodes] fetch/unzip failed", e);
    redirect("/admin/postcodes?error=fetch-failed");
  }

  if (parsed.length === 0) {
    redirect("/admin/postcodes?error=no-rows-parsed");
  }

  // Count current rows so we can report 'X new, Y already present'.
  // AFTER-minus-BEFORE handles the ON CONFLICT skipping without
  // having to track per-statement results.
  const before = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM postcodes WHERE country_code = 'AU'`,
  );
  const beforeCount = Number(before.rows[0]?.count ?? 0);

  // Bulk insert in batches of BATCH_SIZE using UNNEST — one round
  // trip per batch instead of one per row.
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
    await query(
      `INSERT INTO postcodes (country_code, postcode, place_name, latitude, longitude)
       SELECT 'AU',
              unnest($1::text[])      AS postcode,
              unnest($2::text[])      AS place_name,
              unnest($3::numeric[])   AS latitude,
              unnest($4::numeric[])   AS longitude
       ON CONFLICT (country_code, postcode) DO NOTHING`,
      [
        batch.map((r) => r.postcode),
        batch.map((r) => r.placeName),
        batch.map((r) => r.latitude),
        batch.map((r) => r.longitude),
      ],
    );
  }

  const after = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM postcodes WHERE country_code = 'AU'`,
  );
  const afterCount = Number(after.rows[0]?.count ?? 0);
  const inserted = afterCount - beforeCount;
  const skipped = parsed.length - inserted;

  revalidatePath("/admin/postcodes");
  redirect(
    `/admin/postcodes?ok=1&parsed=${parsed.length}&inserted=${inserted}&skipped=${skipped}&bytes=${fetchedBytes}`,
  );
}

#!/usr/bin/env node
/**
 * Clean up partner sandbox ("Test Region") leftovers.
 *
 * The sandbox seeder creates sample sellers (sandbox+<regionId>+sellerN@
 * frockd.test) plus their listings/dresses, all in an inactive test region.
 * The proper teardown removes them, but if a test region was ever deleted
 * directly (e.g. an admin "Delete region" before that path tore sandboxes
 * down) the sample sellers + dresses are orphaned with no region.
 *
 * This script:
 *   1. Tears down any remaining test regions (listings, dresses, sample
 *      sellers, the partner grant, the region itself).
 *   2. Sweeps orphaned sandbox sample sellers + their listings/dresses
 *      whose region is already gone.
 *
 * Dry-run by default — prints what it WOULD remove. Pass --apply to delete.
 *
 *   DATABASE_URL=... node scripts/cleanup-sandbox-orphans.mjs           # report
 *   DATABASE_URL=... node scripts/cleanup-sandbox-orphans.mjs --apply   # delete
 *
 * Falls back to DATABASE_URL in .env.local when the env var isn't set.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const APPLY = process.argv.includes("--apply");

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = await readFile(join(repoRoot, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return null;
}

const SAMPLE_SELLER_LIKE = "sandbox+%@frockd.test";

async function ids(client, sql, params) {
  return (await client.query(sql, params)).rows.map((r) => r.id);
}

async function deleteListingsAndDresses(client, listingIds, dressIds) {
  if (listingIds.length) {
    await client.query(`DELETE FROM listing_images WHERE listing_id = ANY($1::bigint[])`, [listingIds]);
    await client.query(`DELETE FROM dress_ownership_events WHERE via_listing_id = ANY($1::bigint[])`, [listingIds]);
    await client.query(`DELETE FROM listings WHERE id = ANY($1::bigint[])`, [listingIds]);
  }
  if (dressIds.length) {
    await client.query(`DELETE FROM dress_ownership_events WHERE dress_id = ANY($1::bigint[])`, [dressIds]);
    await client.query(`DELETE FROM dresses WHERE id = ANY($1::bigint[])`, [dressIds]);
  }
}

async function main() {
  const connectionString = await resolveDatabaseUrl();
  if (!connectionString) {
    console.error("DATABASE_URL not set and not found in .env.local");
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    const testRegions = (
      await client.query(`SELECT id::text, label FROM regions WHERE is_test = TRUE`)
    ).rows;
    const sampleSellers = await ids(
      client,
      `SELECT id::text FROM users WHERE email LIKE $1`,
      [SAMPLE_SELLER_LIKE],
    );
    const sandboxListings = await ids(
      client,
      `SELECT id::text FROM listings
        WHERE region_id IN (SELECT id FROM regions WHERE is_test = TRUE)
           OR seller_id = ANY($1::bigint[])`,
      [sampleSellers],
    );
    const nullRegion = (
      await client.query(`SELECT COUNT(*)::int AS n FROM listings WHERE region_id IS NULL`)
    ).rows[0].n;

    console.log("Sandbox cleanup —", APPLY ? "APPLY" : "DRY RUN");
    console.log(`  test regions:           ${testRegions.length}`);
    console.log(`  sandbox sample sellers: ${sampleSellers.length}`);
    console.log(`  sandbox listings:       ${sandboxListings.length}`);
    console.log(`  (info) null-region listings (not deleted): ${nullRegion}`);

    if (testRegions.length === 0 && sampleSellers.length === 0) {
      console.log("Nothing to clean. ✅");
      return;
    }
    if (!APPLY) {
      console.log("\nDry run — re-run with --apply to delete the above.");
      return;
    }

    await client.query("BEGIN");

    // 1) Tear down listings/dresses sitting in any test region.
    const regionListingIds = await ids(
      client,
      `SELECT id::text FROM listings WHERE region_id IN (SELECT id FROM regions WHERE is_test = TRUE)`,
    );
    const regionDressIds = await ids(
      client,
      `SELECT DISTINCT dress_id::text AS id FROM listings WHERE region_id IN (SELECT id FROM regions WHERE is_test = TRUE)`,
    );
    await deleteListingsAndDresses(client, regionListingIds, regionDressIds);

    // 2) Orphaned sandbox sample sellers + their listings/dresses.
    if (sampleSellers.length) {
      const sellerListingIds = await ids(
        client,
        `SELECT id::text FROM listings WHERE seller_id = ANY($1::bigint[])`,
        [sampleSellers],
      );
      const sellerDressIds = await ids(
        client,
        `SELECT id::text FROM dresses
          WHERE created_by_user_id = ANY($1::bigint[])
             OR current_owner_user_id = ANY($1::bigint[])`,
        [sampleSellers],
      );
      await deleteListingsAndDresses(client, sellerListingIds, sellerDressIds);
      // Cascade clears their sessions / partner grants etc.
      await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [sampleSellers]);
    }

    // 3) Drop the test regions themselves (grants cascade).
    await client.query(`DELETE FROM regions WHERE is_test = TRUE`);

    await client.query("COMMIT");
    console.log("\nDone. ✅");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Cleanup failed:", err?.message ?? err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

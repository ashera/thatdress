import "server-only";
import type { PoolClient } from "pg";
import { query, withTransaction } from "@/lib/db";
import {
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";
import { resolveSampleImages } from "@/lib/sample-data";

/**
 * Partner sandbox ("Test Region"). A prospective partner gets a private,
 * inactive test region (regions.is_test = TRUE, sandbox_user_id = them)
 * seeded with a few listings, plus the partner flag and a marketing-region
 * grant so the full partner dashboard + buyer/seller tools work. Nobody
 * else can see the sandbox — its inventory is excluded from every public
 * surface (see excludeTestRegionsSql) and only the owner/admin can enter
 * the region (see resolveCurrentRegion).
 *
 * Provisioning and teardown are admin actions driven from the Partner
 * Applications page. Teardown removes the region, its seeded sample
 * accounts + listings, and demotes the prospect if they hold no other
 * (real) region.
 */

export const SANDBOX_SELLER_EMAIL_LIKE = "sandbox+%@frockd.test";
const SANDBOX_LISTINGS = 6;
// Bcrypt-shaped placeholder; sandbox sample sellers never log in.
const DISABLED_HASH = "$2a$12$0000000000000000000000000000000000000000000000000000";

const COLOR_NAMES = ["Blush", "Champagne", "Slate", "Sage", "Mauve", "Taupe"];

export type SandboxResult = {
  regionId: string;
  label: string;
  listings: number;
};

/** Seed a handful of listings into the test region, owned by two
 *  sandbox-namespaced sample sellers so the prospect has inventory to
 *  browse + moderate from day one. */
async function seedSandboxListings(
  c: PoolClient,
  regionId: string,
): Promise<number> {
  const idList = async (table: string): Promise<string[]> =>
    (
      await c.query<{ id: string }>(`SELECT id::text FROM ${table} ORDER BY id`)
    ).rows.map((r) => r.id);
  const pick = (arr: string[], i: number): string | null =>
    arr.length ? arr[i % arr.length] : null;

  const designers = (
    await c.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM designers ORDER BY id`,
    )
  ).rows;
  const occasions = await idList("occasions");
  const conditions = await idList("condition_grades");
  const sizes = await idList("dress_sizes");
  const silhouettes = await idList("silhouettes");
  const fabrics = await idList("fabrics");
  const necklines = await idList("necklines");
  const sleeves = await idList("sleeve_styles");
  const lengths = await idList("dress_lengths");

  // Two sample sellers, namespaced by region so teardown is precise.
  const sellerIds: string[] = [];
  for (let s = 1; s <= 2; s++) {
    const r = await c.query<{ id: string }>(
      `INSERT INTO users
         (email, password_hash, email_verified_at, first_name, surname,
          town, postcode)
       VALUES ($1, $2, NOW(), $3, $4, 'Sandbox', '0000')
       RETURNING id::text`,
      [
        `sandbox+${regionId}+seller${s}@frockd.test`,
        DISABLED_HASH,
        s === 1 ? "Sandy" : "Robin",
        s === 1 ? "Sample" : "Demo",
      ],
    );
    sellerIds.push(r.rows[0]!.id);
  }

  // Real dress photos from db/sample-images/ (cycled), falling back to a
  // generated colour placeholder when that folder isn't present (e.g. in
  // production). One per listing.
  const images = resolveSampleImages(SANDBOX_LISTINGS);

  let made = 0;
  for (let i = 0; i < SANDBOX_LISTINGS; i++) {
    const seller = sellerIds[i % sellerIds.length];
    const designer = designers[i % Math.max(1, designers.length)];
    const model = `Sandbox ${i + 1}`;

    const dRes = await c.query<{ id: string }>(
      `INSERT INTO dresses
         (created_by_user_id, current_owner_user_id, disposition, designer_id,
          model, year, size_id, silhouette_id, fabric_id, neckline_id,
          sleeve_style_id, length_id, color, bust_cm, waist_cm, hips_cm,
          original_retail_cents)
       VALUES ($1::bigint, $1::bigint, 'available', $2::bigint, $3, $4::int,
               $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id::text`,
      [
        seller,
        designer?.id ?? null,
        model,
        2020 + (i % 5),
        pick(sizes, i),
        pick(silhouettes, i),
        pick(fabrics, i),
        pick(necklines, i),
        pick(sleeves, i),
        pick(lengths, i),
        COLOR_NAMES[i % COLOR_NAMES.length],
        80 + (i % 12),
        62 + (i % 12),
        88 + (i % 12),
        40000 + i * 5000,
      ],
    );
    const dressId = dRes.rows[0]!.id;
    await c.query(
      `INSERT INTO dress_ownership_events (dress_id, to_user_id, event_type)
         VALUES ($1::bigint, $2::bigint, 'created')`,
      [dressId, seller],
    );

    const title = `${designer?.name ?? "Designer"} ${model}`;
    const lRes = await c.query<{ id: string }>(
      `INSERT INTO listings
         (dress_id, title, description, price_cents, seller_id, is_draft,
          is_published, region_id, offers_enabled, trust_status, occasion_id,
          condition_id, location_postal, is_authentic_declared)
       VALUES ($1::bigint, $2, $3, $4, $5::bigint, FALSE, TRUE, $6::bigint,
               TRUE, 'self-declared', $7, $8, '0000', TRUE)
       RETURNING id::text`,
      [
        dressId,
        title,
        "Sandbox sample listing — visible only inside your test region.",
        15000 + i * 4000,
        seller,
        regionId,
        pick(occasions, i),
        pick(conditions, i),
      ],
    );
    const listingId = lRes.rows[0]!.id;

    const img = images[i];
    await c.query(
      `INSERT INTO listing_images
         (listing_id, mime_type, bytes, byte_size, position, is_primary, role)
       VALUES ($1::bigint, $2, $3, $4, 0, TRUE, 'front')`,
      [listingId, img.mime, img.bytes, img.bytes.length],
    );
    made++;
  }
  return made;
}

/** Core provisioning, inside an open transaction: create the inactive
 *  test region, flag the user as a partner, grant them the region with the
 *  standard free window, and seed listings. Throws "exists" if the user
 *  already has a sandbox. */
async function provisionInTx(
  c: PoolClient,
  userId: string,
  email: string,
): Promise<SandboxResult> {
  const existing = await c.query<{ id: string }>(
    `SELECT id::text FROM regions
      WHERE is_test = TRUE AND sandbox_user_id = $1::bigint LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) throw new Error("exists");

  const slug = `sandbox-u${userId}`;
  const label = `Sandbox · ${email}`;
  const reg = await c.query<{ id: string }>(
    `INSERT INTO regions (slug, label, short_name, is_active, is_test,
                          sandbox_user_id, sort_order)
     VALUES ($1, $2, 'Sandbox', FALSE, TRUE, $3::bigint, 9999)
     RETURNING id::text`,
    [slug, label, userId],
  );
  const regionId = reg.rows[0]!.id;

  // Flag as partner + grant the sandbox region with the normal free window
  // so the partner dashboard + fee controls are fully usable.
  await c.query(`UPDATE users SET is_partner = TRUE WHERE id = $1::bigint`, [
    userId,
  ]);
  await c.query(
    `INSERT INTO partner_marketing_regions
       (user_id, region_id, listing_fee_cents, activated_at, free_until,
        platform_fee_pct)
     VALUES ($1::bigint, $2::bigint, 0, NOW(),
             NOW() + (INTERVAL '1 month' * $3::int), $4)`,
    [userId, regionId, PARTNER_FREE_MONTHS, PARTNER_PLATFORM_FEE_PCT],
  );

  const listings = await seedSandboxListings(c, regionId);
  return { regionId, label, listings };
}

/**
 * Provision a sandbox for the user behind a partner application (admin path,
 * keyed by application id). Throws "not-found" if the application is gone,
 * "exists" if the prospect already has a sandbox.
 */
export async function provisionSandboxForApplication(
  applicationId: string,
): Promise<SandboxResult> {
  if (!/^\d+$/.test(applicationId)) throw new Error("bad-id");

  return withTransaction(async (c) => {
    const a = await c.query<{ user_id: string; user_email: string }>(
      `SELECT a.user_id::text AS user_id, u.email AS user_email
         FROM partner_applications a
         JOIN users u ON u.id = a.user_id
        WHERE a.id = $1::bigint
        FOR UPDATE OF a`,
      [applicationId],
    );
    const app = a.rows[0];
    if (!app) throw new Error("not-found");
    return provisionInTx(c, app.user_id, app.user_email);
  });
}

/**
 * Provision a sandbox for a user directly (self-service path — a prospect
 * spins up their own from the apply page). Throws "not-found" if the user
 * is gone, "exists" if they already have a sandbox.
 */
export async function provisionSandboxForUser(
  userId: string,
): Promise<SandboxResult> {
  if (!/^\d+$/.test(userId)) throw new Error("bad-id");

  return withTransaction(async (c) => {
    const u = await c.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1::bigint FOR UPDATE`,
      [userId],
    );
    const email = u.rows[0]?.email;
    if (!email) throw new Error("not-found");
    return provisionInTx(c, userId, email);
  });
}

/**
 * Tear a sandbox down: remove its seeded sample sellers + every listing in
 * the region (including any the prospect created themselves), drop the
 * region, and demote the prospect to non-partner if they hold no other
 * marketing region. Idempotent-ish: a no-op if the region isn't a sandbox.
 */
export async function teardownSandbox(regionId: string): Promise<boolean> {
  if (!/^\d+$/.test(regionId)) return false;

  return withTransaction(async (c) => {
    const reg = await c.query<{ sandbox_user_id: string | null }>(
      `SELECT sandbox_user_id::text AS sandbox_user_id
         FROM regions
        WHERE id = $1::bigint AND is_test = TRUE
        FOR UPDATE`,
      [regionId],
    );
    if (reg.rows.length === 0) return false;
    const prospectId = reg.rows[0].sandbox_user_id;

    // Every listing sitting in the sandbox region, whoever the seller is.
    const lids = (
      await c.query<{ id: string }>(
        `SELECT id::text FROM listings WHERE region_id = $1::bigint`,
        [regionId],
      )
    ).rows.map((r) => r.id);

    if (lids.length > 0) {
      await c.query(
        `DELETE FROM listing_images WHERE listing_id = ANY($1::bigint[])`,
        [lids],
      );
      await c.query(
        `DELETE FROM dress_ownership_events WHERE via_listing_id = ANY($1::bigint[])`,
        [lids],
      );
      const dids = (
        await c.query<{ dress_id: string }>(
          `SELECT DISTINCT dress_id::text AS dress_id FROM listings
            WHERE id = ANY($1::bigint[])`,
          [lids],
        )
      ).rows.map((r) => r.dress_id);
      await c.query(`DELETE FROM listings WHERE id = ANY($1::bigint[])`, [lids]);
      if (dids.length > 0) {
        await c.query(
          `DELETE FROM dress_ownership_events WHERE dress_id = ANY($1::bigint[])`,
          [dids],
        );
        await c.query(`DELETE FROM dresses WHERE id = ANY($1::bigint[])`, [dids]);
      }
    }

    // Sandbox sample sellers (namespaced by region id). Cascade clears any
    // sessions/conversations etc. they might have.
    await c.query(`DELETE FROM users WHERE email LIKE $1`, [
      `sandbox+${regionId}+%@frockd.test`,
    ]);

    // Drop the region's partner grant, then the region itself.
    await c.query(
      `DELETE FROM partner_marketing_regions WHERE region_id = $1::bigint`,
      [regionId],
    );
    await c.query(`DELETE FROM regions WHERE id = $1::bigint`, [regionId]);

    // Demote the prospect if the sandbox was their only region.
    if (prospectId) {
      const others = await c.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM partner_marketing_regions
          WHERE user_id = $1::bigint`,
        [prospectId],
      );
      if (Number(others.rows[0]?.n ?? 0) === 0) {
        await c.query(
          `UPDATE users SET is_partner = FALSE WHERE id = $1::bigint`,
          [prospectId],
        );
      }
    }
    return true;
  });
}

/** Sandbox summary for the admin Partner Applications page, keyed by the
 *  applicant user_id, so each application card can show its state. */
export type SandboxInfo = {
  regionId: string;
  label: string;
  listings: number;
};

export async function getSandboxesByUser(): Promise<Record<string, SandboxInfo>> {
  try {
    const r = await query<{
      user_id: string;
      region_id: string;
      label: string;
      listings: string;
    }>(
      `SELECT rg.sandbox_user_id::text AS user_id,
              rg.id::text             AS region_id,
              rg.label                AS label,
              (SELECT COUNT(*)::text FROM listings l WHERE l.region_id = rg.id)
                                      AS listings
         FROM regions rg
        WHERE rg.is_test = TRUE AND rg.sandbox_user_id IS NOT NULL`,
    );
    const map: Record<string, SandboxInfo> = {};
    for (const row of r.rows) {
      map[row.user_id] = {
        regionId: row.region_id,
        label: row.label,
        listings: Number(row.listings),
      };
    }
    return map;
  } catch {
    return {};
  }
}

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * Test-only Postgres helpers for the LOCAL write-flow suite: create
 * throwaway users, mint sessions (so tests can authenticate without
 * going through the login UI), and clean up everything a test created.
 *
 * Targets the same local DB the app uses (DATABASE_URL / .env.local).
 */

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through */
  }
  throw new Error("DATABASE_URL not set and not found in .env.local");
}

async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// A bcrypt-shaped placeholder; session-authed tests never verify it.
const DISABLED_HASH = "$2a$12$0000000000000000000000000000000000000000000000000000";

export type TestUser = { id: string; email: string; password: string };

/** Create a verified throwaway user. Email is namespaced so cleanup and
 *  human eyeballing are easy. Pass `password` when the test logs in or
 *  changes it through the UI (otherwise a non-verifying placeholder is
 *  stored and you authenticate via mintSession). */
export async function createTestUser(
  opts: { isPartner?: boolean; isAdmin?: boolean; password?: string } = {},
): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${randomBytes(3).toString("hex")}@frockd.test`;
  const password = opts.password ?? "";
  const hash = password ? await bcrypt.hash(password, 10) : DISABLED_HASH;
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, email_verified_at, is_partner, is_admin)
         VALUES ($1, $2, NOW(), $3, $4)
         RETURNING id::text`,
      [email, hash, !!opts.isPartner, !!opts.isAdmin],
    );
    return { id: r.rows[0]!.id, email, password };
  });
}

/** Insert a published, ready-to-buy listing owned by `sellerId` (dress +
 *  ownership event + listing). Used to set up buyer/seller flows without
 *  walking the wizard each time. Returns the new ids. */
export async function seedListing(
  sellerId: string,
  opts: {
    regionId?: string;
    priceCents?: number;
    offersEnabled?: boolean;
    title?: string;
  } = {},
): Promise<{ listingId: string; dressId: string }> {
  const regionId = opts.regionId ?? "1";
  const priceCents = opts.priceCents ?? 20000;
  const offersEnabled = opts.offersEnabled ?? true;
  const title = opts.title ?? "E2E Seed Dress";
  return withDb(async (c) => {
    // Populate designer/model/occasion/condition so the listing is
    // "complete" — required for the wizard's edit→save path to work.
    const d = await c.query<{ id: string }>(
      `INSERT INTO dresses
         (created_by_user_id, current_owner_user_id, disposition,
          designer_id, model)
       VALUES ($1::bigint, $1::bigint, 'available',
          (SELECT id FROM designers ORDER BY id LIMIT 1), 'E2E Model')
       RETURNING id::text`,
      [sellerId],
    );
    const dressId = d.rows[0]!.id;
    await c.query(
      `INSERT INTO dress_ownership_events (dress_id, to_user_id, event_type)
         VALUES ($1::bigint, $2::bigint, 'created')`,
      [dressId, sellerId],
    );
    const l = await c.query<{ id: string }>(
      `INSERT INTO listings
         (dress_id, title, price_cents, seller_id, is_draft, is_published,
          region_id, offers_enabled, trust_status, occasion_id, condition_id,
          location_postal)
       VALUES ($1::bigint, $2, $3, $4::bigint, FALSE, TRUE, $5::bigint, $6,
               'self-declared',
               (SELECT id FROM occasions ORDER BY id LIMIT 1),
               (SELECT id FROM condition_grades ORDER BY id LIMIT 1),
               '3000')
       RETURNING id::text`,
      [dressId, title, priceCents, sellerId, regionId, offersEnabled],
    );
    return { listingId: l.rows[0]!.id, dressId };
  });
}

/** Create a throwaway ACTIVE, unclaimed region so the partner-application
 *  funnel has something to apply for (the seeded active regions are all
 *  taken). Deleting it cascades any applications / grants for it. */
export async function createTestRegion(): Promise<{ id: string; label: string }> {
  const slug = `e2e-region-${Date.now()}-${randomBytes(2).toString("hex")}`;
  const label = "E2E Test Region";
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO regions (slug, label, is_active) VALUES ($1, $2, TRUE)
       RETURNING id::text`,
      [slug, label],
    );
    return { id: r.rows[0]!.id, label };
  });
}

/** Insert a pending partner application (the sandbox provisioning flow
 *  starts from one). Returns the application id. */
export async function createPartnerApplication(
  userId: string,
  regionId: string,
): Promise<string> {
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO partner_applications (user_id, region_id, status, pitch)
         VALUES ($1::bigint, $2::bigint, 'pending', 'E2E sandbox applicant')
       RETURNING id::text`,
      [userId, regionId],
    );
    return r.rows[0]!.id;
  });
}

/** Create a sandbox/test region owned by `ownerUserId` (is_test = TRUE,
 *  is_active = FALSE). Mirrors what provisioning sets for the isolation
 *  surface; pair with seedListing({ regionId }) to put stock inside it.
 *  cleanupSandboxFor(ownerUserId) tears it back down. */
export async function createSandboxRegion(
  ownerUserId: string,
  opts: { label?: string } = {},
): Promise<{ regionId: string; label: string }> {
  const slug = `sandbox-e2e-${Date.now()}-${randomBytes(2).toString("hex")}`;
  const label = opts.label ?? "E2E Sandbox";
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO regions (slug, label, is_active, is_test, sandbox_user_id, sort_order)
         VALUES ($1, $2, FALSE, TRUE, $3::bigint, 9999)
       RETURNING id::text`,
      [slug, label, ownerUserId],
    );
    return { regionId: r.rows[0]!.id, label };
  });
}

/** The sandbox/test region provisioned for a user, if any. */
export async function getSandboxRegion(
  userId: string,
): Promise<{ id: string; label: string } | null> {
  return withDb(async (c) => {
    const r = await c.query<{ id: string; label: string }>(
      `SELECT id::text, label FROM regions
        WHERE is_test = TRUE AND sandbox_user_id = $1::bigint LIMIT 1`,
      [userId],
    );
    return r.rows[0] ?? null;
  });
}

export async function countListingsInRegion(regionId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM listings WHERE region_id = $1::bigint`,
      [regionId],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

export async function firstListingIdInRegion(
  regionId: string,
): Promise<string | null> {
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM listings WHERE region_id = $1::bigint
        ORDER BY id LIMIT 1`,
      [regionId],
    );
    return r.rows[0]?.id ?? null;
  });
}

export async function getUserIsPartner(userId: string): Promise<boolean> {
  return withDb(async (c) => {
    const r = await c.query<{ is_partner: boolean }>(
      `SELECT is_partner FROM users WHERE id = $1::bigint`,
      [userId],
    );
    return r.rows[0]?.is_partner === true;
  });
}

/** Remove any sandbox region(s) a user owns, plus their seeded sample
 *  sellers + listings — a safety net for afterAll when a test bails before
 *  the UI teardown runs. FK-safe order: children before parents. */
export async function cleanupSandboxFor(userId: string): Promise<void> {
  if (!/^\d+$/.test(userId)) return;
  await withDb(async (c) => {
    const rids = (
      await c.query<{ id: string }>(
        `SELECT id::text FROM regions
          WHERE is_test = TRUE AND sandbox_user_id = $1::bigint`,
        [userId],
      )
    ).rows.map((r) => r.id);
    for (const rid of rids) {
      const lids = (
        await c.query<{ id: string }>(
          `SELECT id::text FROM listings WHERE region_id = $1::bigint`,
          [rid],
        )
      ).rows.map((r) => r.id);
      const dids = (
        await c.query<{ dress_id: string }>(
          `SELECT DISTINCT dress_id::text AS dress_id FROM listings
            WHERE region_id = $1::bigint`,
          [rid],
        )
      ).rows.map((r) => r.dress_id);
      if (lids.length > 0) {
        await c.query(
          `DELETE FROM listing_images WHERE listing_id = ANY($1::bigint[])`,
          [lids],
        );
        await c.query(
          `DELETE FROM dress_ownership_events WHERE via_listing_id = ANY($1::bigint[])`,
          [lids],
        );
        await c.query(`DELETE FROM listings WHERE id = ANY($1::bigint[])`, [lids]);
      }
      if (dids.length > 0) {
        await c.query(
          `DELETE FROM dress_ownership_events WHERE dress_id = ANY($1::bigint[])`,
          [dids],
        );
        await c.query(`DELETE FROM dresses WHERE id = ANY($1::bigint[])`, [dids]);
      }
      await c.query(`DELETE FROM users WHERE email LIKE $1`, [
        `sandbox+${rid}+%@frockd.test`,
      ]);
      await c.query(
        `DELETE FROM partner_marketing_regions WHERE region_id = $1::bigint`,
        [rid],
      );
      await c.query(`DELETE FROM regions WHERE id = $1::bigint`, [rid]);
    }
  });
}

export async function deleteTestRegions(ids: string[]): Promise<void> {
  const valid = ids.filter((id) => /^\d+$/.test(id));
  if (valid.length === 0) return;
  await withDb((c) =>
    c.query(`DELETE FROM regions WHERE id = ANY($1::bigint[])`, [valid]),
  );
}

/** Partner activation state for a user+region (for funnel assertions). */
export async function getPartnerActivation(
  userId: string,
  regionId: string,
): Promise<{
  isPartner: boolean;
  appStatus: string | null;
  platformFeePct: number | null;
  freeInFuture: boolean;
}> {
  return withDb(async (c) => {
    const u = await c.query<{ is_partner: boolean }>(
      `SELECT is_partner FROM users WHERE id = $1::bigint`,
      [userId],
    );
    const pmr = await c.query<{ pct: string; free_future: boolean }>(
      `SELECT platform_fee_pct::text AS pct, (free_until > NOW()) AS free_future
         FROM partner_marketing_regions
        WHERE user_id = $1::bigint AND region_id = $2::bigint LIMIT 1`,
      [userId, regionId],
    );
    const app = await c.query<{ status: string }>(
      `SELECT status FROM partner_applications
        WHERE user_id = $1::bigint AND region_id = $2::bigint
        ORDER BY id DESC LIMIT 1`,
      [userId, regionId],
    );
    return {
      isPartner: u.rows[0]?.is_partner === true,
      appStatus: app.rows[0]?.status ?? null,
      platformFeePct: pmr.rows[0] ? Number(pmr.rows[0].pct) : null,
      freeInFuture: pmr.rows[0]?.free_future === true,
    };
  });
}

/** Give a partner user a marketing region (so the partner dashboard has
 *  a region to configure fees for). Pick a region not already taken. */
export async function assignPartnerRegion(
  userId: string,
  regionId: string,
): Promise<void> {
  await withDb((c) =>
    c.query(
      `INSERT INTO partner_marketing_regions (user_id, region_id, listing_fee_cents)
         VALUES ($1::bigint, $2::bigint, 0)
       ON CONFLICT (region_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [userId, regionId],
    ),
  );
}

/** The fee a partner has set for a region, in cents (for assertions). */
export async function getRegionFeeCents(regionId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ listing_fee_cents: number }>(
      `SELECT listing_fee_cents FROM partner_marketing_regions
        WHERE region_id = $1::bigint LIMIT 1`,
      [regionId],
    );
    return Number(r.rows[0]?.listing_fee_cents ?? 0);
  });
}

/** Seed a buyer↔seller conversation on a listing with one buyer message,
 *  so the buyer is attributable in the seller's mark-sold dialog and the
 *  thread has content. Returns the conversation id. */
export async function seedConversation(
  listingId: string,
  buyerId: string,
  sellerId: string,
  body = "Hi, is this still available?",
): Promise<string> {
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id)
         VALUES ($1::bigint, $2::bigint, $3::bigint)
       RETURNING id::text`,
      [listingId, buyerId, sellerId],
    );
    const id = r.rows[0]!.id;
    await c.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1::bigint, $2::bigint, $3)`,
      [id, buyerId, body],
    );
    return id;
  });
}

/** Seller's review tally (non-hidden), for asserting the review loop. */
export async function getSellerRating(
  sellerId: string,
): Promise<{ count: number; average: number }> {
  return withDb(async (c) => {
    const r = await c.query<{ count: string; average: string | null }>(
      `SELECT COUNT(*)::text AS count,
              ROUND(AVG(stars)::numeric, 1)::text AS average
         FROM listing_reviews
        WHERE seller_id = $1::bigint AND hidden_by_admin_at IS NULL`,
      [sellerId],
    );
    return {
      count: Number(r.rows[0]?.count ?? 0),
      average: Number(r.rows[0]?.average ?? 0),
    };
  });
}

/** Set a listing's published flag (e.g. to test hidden-listing visibility). */
export async function setListingPublished(
  listingId: string,
  published: boolean,
): Promise<void> {
  await withDb((c) =>
    c.query(`UPDATE listings SET is_published = $2 WHERE id = $1::bigint`, [
      listingId,
      published,
    ]),
  );
}

/** Insert a session row and return its id (use as the `session` cookie). */
export async function mintSession(userId: string): Promise<string> {
  const sid = randomBytes(32).toString("base64url");
  await withDb((c) =>
    c.query(
      `INSERT INTO sessions (id, user_id, expires_at)
         VALUES ($1, $2::bigint, NOW() + INTERVAL '1 day')`,
      [sid, userId],
    ),
  );
  return sid;
}

/** Fetch a listing's mutable fields (for assertions). */
export async function getListing(
  listingId: string,
): Promise<{ price_cents: number; sold_at: string | null; description: string | null } | null> {
  return withDb(async (c) => {
    const r = await c.query<{
      price_cents: number;
      sold_at: string | null;
      description: string | null;
    }>(
      `SELECT price_cents, sold_at::text, description FROM listings
        WHERE id = $1::bigint LIMIT 1`,
      [listingId],
    );
    return r.rows[0] ?? null;
  });
}

/** Rows a buyer has shortlisted (for assertions). */
export async function countShortlist(userId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM shortlists WHERE user_id = $1::bigint`,
      [userId],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

/** Offers a buyer has made (for assertions). */
export async function countOffersByBuyer(userId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM offers WHERE buyer_id = $1::bigint`,
      [userId],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

/** Count a seller's published (non-draft) listings — handy for asserts. */
export async function countPublishedListings(userId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM listings
        WHERE seller_id = $1::bigint AND is_draft = FALSE`,
      [userId],
    );
    return Number(r.rows[0]?.n ?? 0);
  });
}

/** Remove a user and everything a write-flow test could have created for
 *  them (listings, their images, dresses, ownership events, sessions).
 *  Order respects FKs: children before parents. Safe to call twice. */
export async function cleanupUsers(userIds: string[]): Promise<void> {
  const ids = userIds.filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return;
  await withDb(async (c) => {
    await c.query(
      `DELETE FROM listing_images
        WHERE listing_id IN (SELECT id FROM listings WHERE seller_id = ANY($1::bigint[]))`,
      [ids],
    );
    await c.query(
      `DELETE FROM dress_ownership_events
        WHERE dress_id IN (
                SELECT id FROM dresses
                 WHERE created_by_user_id = ANY($1::bigint[])
                    OR current_owner_user_id = ANY($1::bigint[]))
           OR to_user_id = ANY($1::bigint[])
           OR from_user_id = ANY($1::bigint[])`,
      [ids],
    );
    await c.query(`DELETE FROM listings WHERE seller_id = ANY($1::bigint[])`, [ids]);
    await c.query(
      `DELETE FROM dresses
        WHERE created_by_user_id = ANY($1::bigint[])
           OR current_owner_user_id = ANY($1::bigint[])`,
      [ids],
    );
    await c.query(`DELETE FROM sessions WHERE user_id = ANY($1::bigint[])`, [ids]);
    // Captured emails sent TO the test users, plus any test-triggered
    // notifications sent to real users (e.g. admin ticket alerts) — those
    // carry the 'E2E' marker from the test-generated subject/content.
    await c.query(
      `DELETE FROM sent_emails
        WHERE to_email IN (SELECT email FROM users WHERE id = ANY($1::bigint[]))
           OR subject LIKE '%E2E%'`,
      [ids],
    );
    await c.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
  });
}

/** The most recent captured email sent to an address (requires the app
 *  to run with EMAIL_CAPTURE=1). Returns null if none. */
export async function getLastEmailTo(
  email: string,
): Promise<{ subject: string; html: string } | null> {
  return withDb(async (c) => {
    const r = await c.query<{ subject: string; html: string }>(
      `SELECT subject, html FROM sent_emails
        WHERE to_email LIKE '%' || $1 || '%'
        ORDER BY created_at DESC LIMIT 1`,
      [email],
    );
    return r.rows[0] ?? null;
  });
}

/** Read the fields the streamlined partner signup captures, for asserting
 *  an inline-registered account landed correctly. Null if no such user. */
export async function getUserSignup(email: string): Promise<{
  id: string;
  first_name: string | null;
  surname: string | null;
  mobile: string | null;
} | null> {
  return withDb(async (c) => {
    const r = await c.query<{
      id: string;
      first_name: string | null;
      surname: string | null;
      mobile: string | null;
    }>(
      `SELECT id::text, first_name, surname, mobile FROM users
        WHERE email = $1 LIMIT 1`,
      [email],
    );
    return r.rows[0] ?? null;
  });
}

/** Look up a user id by email (for cleaning up users created via the UI). */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `SELECT id::text FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    return r.rows[0]?.id ?? null;
  });
}

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
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

// A bcrypt-shaped placeholder; tests that authenticate use a minted
// session, not password login, so this never needs to verify.
const DISABLED_HASH = "$2a$12$0000000000000000000000000000000000000000000000000000";

export type TestUser = { id: string; email: string };

/** Create a verified throwaway user. Email is namespaced so cleanup and
 *  human eyeballing are easy. */
export async function createTestUser(
  opts: { isPartner?: boolean; isAdmin?: boolean } = {},
): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${randomBytes(3).toString("hex")}@frockd.test`;
  return withDb(async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, email_verified_at, is_partner, is_admin)
         VALUES ($1, $2, NOW(), $3, $4)
         RETURNING id::text`,
      [email, DISABLED_HASH, !!opts.isPartner, !!opts.isAdmin],
    );
    return { id: r.rows[0]!.id, email };
  });
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
    await c.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
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

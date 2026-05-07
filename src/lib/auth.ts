import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

const SESSION_COOKIE = "session";
const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 12;

export type User = {
  id: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
  title: string | null;
  firstName: string | null;
  surname: string | null;
  town: string | null;
  postcode: string | null;
  /** Set when an admin is impersonating this user. The id and email
   *  are of the *original* admin; the rest of the User fields are
   *  the target's. UI uses these to show the 'Acting as X' banner
   *  and a switch-back link. */
  impersonatorId: string | null;
  impersonatorEmail: string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<void> {
  const id = generateSessionId();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
    [id, userId, expiresAt],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await query("DELETE FROM sessions WHERE id = $1", [id]).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  try {
    const result = await query<{
      id: string;
      email: string;
      is_admin: boolean;
      email_verified_at: string | null;
      title: string | null;
      first_name: string | null;
      surname: string | null;
      town: string | null;
      postcode: string | null;
      impersonator_id: string | null;
      impersonator_email: string | null;
    }>(
      `SELECT u.id::text AS id,
              u.email,
              u.is_admin,
              u.email_verified_at::text,
              u.title,
              u.first_name,
              u.surname,
              u.town,
              u.postcode,
              s.impersonator_user_id::text AS impersonator_id,
              imp.email                    AS impersonator_email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN users imp ON imp.id = s.impersonator_user_id
        WHERE s.id = $1
          AND s.expires_at > NOW()
          AND u.suspended_at IS NULL
        LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      isAdmin: row.is_admin,
      emailVerified: !!row.email_verified_at,
      title: row.title,
      firstName: row.first_name,
      surname: row.surname,
      town: row.town,
      postcode: row.postcode,
      impersonatorId: row.impersonator_id,
      impersonatorEmail: row.impersonator_email,
    };
  } catch {
    return null;
  }
}

/** Mint a new session for `targetUserId` flagged with `impersonatorId`
 *  as the admin who initiated the impersonation, and set the session
 *  cookie to the new id. Doesn't touch the original admin session — if
 *  it still exists it'll just be inactive until the admin uses
 *  endImpersonationSession() to come back. */
export async function startImpersonationSession(
  targetUserId: string,
  impersonatorId: string,
): Promise<void> {
  const id = generateSessionId();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await query(
    `INSERT INTO sessions (id, user_id, expires_at, impersonator_user_id)
       VALUES ($1, $2, $3, $4)`,
    [id, targetUserId, expiresAt, impersonatorId],
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** End the current impersonation session and restore the admin's own
 *  session. Looks up the impersonator id from the current session,
 *  deletes that row, mints a fresh session for the admin, replaces
 *  the cookie. Returns the admin's id (so the caller can decide where
 *  to redirect to), or null when no impersonation was active. */
export async function endImpersonationSession(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const r = await query<{ impersonator_user_id: string | null }>(
    `SELECT impersonator_user_id::text FROM sessions WHERE id = $1 LIMIT 1`,
    [id],
  );
  const impersonatorId = r.rows[0]?.impersonator_user_id ?? null;
  if (!impersonatorId) return null;

  await query(`DELETE FROM sessions WHERE id = $1`, [id]).catch(() => {});

  const newId = generateSessionId();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [newId, impersonatorId, expiresAt],
  );
  jar.set(SESSION_COOKIE, newId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return impersonatorId;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");
  return user;
}

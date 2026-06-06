import "server-only";
import { query } from "@/lib/db";

/**
 * Dev-only one-click login helper. Gated on DEV_LOGIN=1 (set in .env.local
 * for local manual testing). NEVER enable in production — it lets anyone
 * sign in as any user without a password. Both the UI and the server
 * action check this flag.
 */
export function devLoginEnabled(): boolean {
  return process.env.DEV_LOGIN === "1";
}

export type DevUser = {
  id: string;
  email: string;
  is_admin: boolean;
  is_partner: boolean;
  suspended: boolean;
};

export async function listDevUsers(): Promise<DevUser[]> {
  if (!devLoginEnabled()) return [];
  try {
    const r = await query<{
      id: string;
      email: string;
      is_admin: boolean;
      is_partner: boolean;
      suspended: boolean;
    }>(
      `SELECT id::text, email, is_admin, is_partner,
              (suspended_at IS NOT NULL) AS suspended
         FROM users
        ORDER BY is_admin DESC, is_partner DESC, id`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

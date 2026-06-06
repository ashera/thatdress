"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { devLoginEnabled } from "@/lib/dev-login";
import { query } from "@/lib/db";

/**
 * Sign in as an arbitrary user with one click — DEV ONLY. Hard-gated on
 * DEV_LOGIN=1 so it is inert in production even if the form were somehow
 * submitted. Bypasses the password by design (local testing).
 */
export async function devLoginAs(formData: FormData): Promise<void> {
  if (!devLoginEnabled()) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  if (!/^\d+$/.test(userId)) redirect("/login");

  const r = await query<{ id: string }>(
    `SELECT id::text FROM users WHERE id = $1::bigint LIMIT 1`,
    [userId],
  );
  if (!r.rows[0]) redirect("/login");

  await createSession(userId);
  redirect("/");
}

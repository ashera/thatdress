"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dispatchVerificationEmail } from "@/lib/email-verify";

const VERIFY_FLASH_COOKIE = "verify_flash";
/** Read by the banner once and then expires by itself — short window
 *  is enough to show the toast on the next render but not so long it
 *  haunts the user across navigations. */
const FLASH_TTL_SECONDS = 8;
/** Don't dispatch a fresh verification email more than once per
 *  THROTTLE_SECONDS for a given user. The check uses the most recent
 *  email_verification_tokens row's created_at as the wall clock. */
const THROTTLE_SECONDS = 60;

async function setFlash(value: "sent" | "throttled"): Promise<void> {
  const jar = await cookies();
  jar.set(VERIFY_FLASH_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLASH_TTL_SECONDS,
  });
}

export async function resendVerificationEmail(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/");

  // Throttle: don't blast Resend (or the user's inbox) when the
  // last verification email went out moments ago. Pick the newest
  // token row and bail if it's still warm.
  const recent = await query<{ created_at: string }>(
    `SELECT created_at::text FROM email_verification_tokens
      WHERE user_id = $1::bigint
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.id],
  );
  const last = recent.rows[0]?.created_at;
  const throttled =
    last !== undefined &&
    Date.now() - new Date(last).getTime() < THROTTLE_SECONDS * 1000;

  if (throttled) {
    await setFlash("throttled");
    redirect("/");
  }

  await dispatchVerificationEmail(user.id, user.email);
  await setFlash("sent");
  redirect("/");
}

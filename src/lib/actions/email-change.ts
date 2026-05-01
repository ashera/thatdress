"use server";

import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { dispatchEmailChangeRequest } from "@/lib/email-change";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestEmailChange(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const newEmail = String(formData.get("new_email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    redirect("/profile?email_error=invalid");
  }
  if (newEmail === user.email.toLowerCase()) {
    redirect("/profile?email_error=same");
  }
  if (!password) {
    redirect("/profile?email_error=password");
  }

  const r = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1::bigint LIMIT 1`,
    [user.id],
  );
  const row = r.rows[0];
  if (!row) redirect("/login");

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    redirect("/profile?email_error=password");
  }

  const taken = await query<{ id: string }>(
    `SELECT id::text FROM users WHERE email = $1 LIMIT 1`,
    [newEmail],
  );
  if (taken.rows.length > 0) {
    redirect("/profile?email_error=taken");
  }

  const dispatch = await dispatchEmailChangeRequest(
    user.id,
    user.email,
    newEmail,
  );
  if (!dispatch.ok) {
    // eslint-disable-next-line no-console
    console.error("[email-change] dispatch failed", dispatch.error);
    redirect("/profile?email_error=send");
  }

  redirect("/profile?email_sent=1");
}

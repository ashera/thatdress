"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

/** Empty the captured-email inbox (local testing convenience). */
export async function clearCapturedEmails(): Promise<void> {
  await requireAdmin();
  await query(`DELETE FROM sent_emails`);
  revalidatePath("/admin/emails");
  redirect("/admin/emails");
}

/** Delete a single captured email. */
export async function deleteCapturedEmail(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (/^\d+$/.test(id)) {
    await query(`DELETE FROM sent_emails WHERE id = $1::bigint`, [id]);
  }
  revalidatePath("/admin/emails");
  redirect("/admin/emails");
}

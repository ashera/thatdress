"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { destroySession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { query, withTransaction } from "@/lib/db";

const CONFIRM_PHRASE = "DELETE";

export async function deleteAccount(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "").trim();

  if (confirm !== CONFIRM_PHRASE) {
    redirect("/profile?delete_error=phrase");
  }

  const r = await query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1::bigint LIMIT 1`,
    [user.id],
  );
  const row = r.rows[0];
  if (!row) {
    redirect("/login");
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    redirect("/profile?delete_error=password");
  }

  // Listings have ON DELETE SET NULL on seller_id, which would orphan them.
  // Delete them explicitly so dependent rows (images, offers, conversations
  // tied to the listing, etc.) cascade away.
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM listings WHERE seller_id = $1::bigint`, [
      user.id,
    ]);
    await client.query(`DELETE FROM users WHERE id = $1::bigint`, [user.id]);
  });

  await destroySession();
  revalidatePath("/", "layout");
  redirect("/?account_deleted=1");
}

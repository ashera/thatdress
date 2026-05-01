"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function toggleShortlist(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    const next = String(formData.get("next") ?? "/listings");
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) return;

  const r = await query<{ existed: boolean }>(
    `WITH del AS (
       DELETE FROM shortlists
        WHERE user_id = $1::bigint AND listing_id = $2::bigint
        RETURNING TRUE AS existed
     )
     SELECT existed FROM del`,
    [user.id, listingId],
  );

  if (r.rows.length === 0) {
    await query(
      `INSERT INTO shortlists (user_id, listing_id)
       VALUES ($1::bigint, $2::bigint)
       ON CONFLICT DO NOTHING`,
      [user.id, listingId],
    );
  }

  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
  revalidatePath("/shortlist");
}

export async function ignoreFromShortlist(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) return;

  await query(
    `UPDATE shortlists
        SET ignored_at = NOW()
      WHERE user_id = $1::bigint AND listing_id = $2::bigint`,
    [user.id, listingId],
  );

  revalidatePath("/shortlist");
  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
}

export async function reinstateShortlist(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) return;

  await query(
    `UPDATE shortlists
        SET ignored_at = NULL
      WHERE user_id = $1::bigint AND listing_id = $2::bigint`,
    [user.id, listingId],
  );

  revalidatePath("/shortlist");
  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
}

export async function removeFromShortlist(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingId = String(formData.get("listingId") ?? "");
  if (!/^\d+$/.test(listingId)) return;

  await query(
    `DELETE FROM shortlists
      WHERE user_id = $1::bigint AND listing_id = $2::bigint`,
    [user.id, listingId],
  );

  revalidatePath("/shortlist");
  revalidatePath("/listings");
  revalidatePath(`/listings/${listingId}`);
}

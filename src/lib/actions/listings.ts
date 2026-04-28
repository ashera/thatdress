"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const PRICE_MAX_DOLLARS = 1_000_000;

function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const dollars = Number.parseFloat(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  if (dollars > PRICE_MAX_DOLLARS) return null;
  return Math.round(dollars * 100);
}

export async function createListing(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?error=invalid-credentials");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "");

  if (!title || title.length > TITLE_MAX) {
    redirect("/listings/new?error=invalid-title");
  }
  if (description.length > DESCRIPTION_MAX) {
    redirect("/listings/new?error=long-description");
  }

  const priceCents = parsePriceToCents(priceRaw);
  if (priceCents === null) {
    redirect("/listings/new?error=invalid-price");
  }

  await query(
    `INSERT INTO listings (title, description, price_cents, seller_id)
     VALUES ($1, $2, $3, $4)`,
    [title, description || null, priceCents, user.id],
  );

  revalidatePath("/listings");
  redirect("/listings");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  cleanupSampleData,
  sampleDataEnabled,
  seedSampleData,
} from "@/lib/sample-data";

const PATH = "/admin/sample-data";

/** Seed (or re-seed — it cleans first) the local sample dataset. The
 *  number of listings comes from the form (clamped in seedSampleData). */
export async function seedSample(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!sampleDataEnabled()) redirect(`${PATH}?error=disabled`);
  const raw = String(formData.get("count") ?? "").trim();
  const listings = /^\d+$/.test(raw) ? Number(raw) : undefined;
  const counts = await seedSampleData({ listings });
  revalidatePath(PATH);
  redirect(`${PATH}?seeded=${counts.listings}`);
}

/** Remove all sample data (sample+*@frockd.test users + their content). */
export async function cleanupSample(): Promise<void> {
  await requireAdmin();
  if (!sampleDataEnabled()) redirect(`${PATH}?error=disabled`);
  const { usersRemoved } = await cleanupSampleData();
  revalidatePath(PATH);
  redirect(`${PATH}?cleaned=${usersRemoved}`);
}

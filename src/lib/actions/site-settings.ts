"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_SITE_SETTINGS,
  loadSiteSettings,
  updateSiteSettings,
} from "@/lib/site-settings";

const PAGE_PATH = "/admin/site-settings";

function parseInt0(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export async function saveSiteSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const current = await loadSiteSettings();
  const allowIndexing = formData.get("allow_indexing") === "on";
  const healthThresholdVerified = parseInt0(
    formData.get("health_threshold_verified"),
    0,
    100,
    current.healthThresholdVerified ??
      DEFAULT_SITE_SETTINGS.healthThresholdVerified,
  );
  await updateSiteSettings({ allowIndexing, healthThresholdVerified });

  // The metadata layout function reads site_settings on every request,
  // and so does /robots.txt. Touch the root + robots so any cached
  // versions invalidate immediately. /listings/mine also reads the
  // threshold for the per-draft health chips.
  revalidatePath("/", "layout");
  revalidatePath("/robots.txt");
  revalidatePath("/listings/mine");

  redirect(`${PAGE_PATH}?saved=1`);
}

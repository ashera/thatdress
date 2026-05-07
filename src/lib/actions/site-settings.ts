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

/** Parse a dollars-as-string input ('25', '25.00', '25.5') into AUD
 *  cents. Falls back to the previous value when the input is missing
 *  or malformed. Caps at $10,000 to stop a fat-fingered '2500' from
 *  becoming a $2.5M payout per friend. */
function parseDollarsToCents(
  raw: FormDataEntryValue | null,
  fallback: number,
): number {
  const s = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (!s) return fallback;
  const dollars = Number(s);
  if (!Number.isFinite(dollars) || dollars < 0) return fallback;
  const cents = Math.round(dollars * 100);
  if (cents > 10_000 * 100) return fallback;
  return cents;
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
  const referralCommissionCents = parseDollarsToCents(
    formData.get("referral_commission_dollars"),
    current.referralCommissionCents ??
      DEFAULT_SITE_SETTINGS.referralCommissionCents,
  );
  await updateSiteSettings({
    allowIndexing,
    healthThresholdVerified,
    referralCommissionCents,
  });

  // The metadata layout function reads site_settings on every request,
  // and so does /robots.txt. Touch the root + robots so any cached
  // versions invalidate immediately. /listings/mine also reads the
  // threshold for the per-draft health chips.
  revalidatePath("/", "layout");
  revalidatePath("/robots.txt");
  revalidatePath("/listings/mine");
  revalidatePath("/profile/refer");
  revalidatePath("/admin/referrals");

  redirect(`${PAGE_PATH}?saved=1`);
}

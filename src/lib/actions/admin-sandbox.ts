"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSandboxRegionForUser } from "@/lib/regions";
import {
  provisionSandboxForApplication,
  provisionSandboxForUser,
  teardownSandbox,
} from "@/lib/partner-sandbox";

const PATH = "/admin/partner-applications";
const REGIONS = "/admin/regions";

/** Start a sandbox/test region for the applicant behind an application. */
export async function startSandbox(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("application_id") ?? "");
  if (!/^\d+$/.test(id)) redirect(PATH);

  try {
    await provisionSandboxForApplication(id);
  } catch (e) {
    const code = e instanceof Error ? e.message : "error";
    redirect(`${PATH}?error=sandbox-${code === "exists" ? "exists" : "failed"}`);
  }

  revalidatePath(PATH);
  revalidatePath("/admin/regions");
  redirect(`${PATH}?done=sandbox-started`);
}

/** Tear down a sandbox/test region. */
export async function endSandbox(formData: FormData): Promise<void> {
  await requireAdmin();
  const regionId = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(regionId)) redirect(PATH);

  await teardownSandbox(regionId);

  revalidatePath(PATH);
  revalidatePath("/admin/regions");
  redirect(`${PATH}?done=sandbox-ended`);
}

/** Spin up a private sandbox/test region owned by the admin themselves, so
 *  they can trial the marketplace end to end. Only the owner (and admins)
 *  can enter it; its seeded stock never leaks to public surfaces. One per
 *  admin — re-running while one exists is a no-op error. */
export async function createAdminSandbox(): Promise<void> {
  const user = await requireAdmin();
  try {
    await provisionSandboxForUser(user.id);
  } catch (e) {
    const code = e instanceof Error ? e.message : "error";
    redirect(`${REGIONS}?error=sandbox-${code === "exists" ? "exists" : "failed"}`);
  }
  revalidatePath(REGIONS);
  revalidatePath("/", "layout");
  redirect(`${REGIONS}?done=sandbox-created`);
}

/** Tear down the admin's own sandbox. Scoped to their sandbox so this
 *  control can never remove someone else's. */
export async function endAdminSandbox(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const regionId = String(formData.get("region_id") ?? "");
  if (!/^\d+$/.test(regionId)) redirect(REGIONS);

  const own = await getSandboxRegionForUser(user.id);
  if (!own || own.id !== regionId) {
    redirect(`${REGIONS}?error=sandbox-failed`);
  }

  await teardownSandbox(regionId);
  revalidatePath(REGIONS);
  revalidatePath("/", "layout");
  redirect(`${REGIONS}?done=sandbox-ended`);
}

/** Only ever redirect back to an admin region page (guards the `from`
 *  field against an open redirect). */
function safeRegionFrom(from: string): string {
  return /^\/admin\/regions(\/\d+)?$/.test(from) ? from : REGIONS;
}

/** Provision a sandbox for a region's assigned partner, driven from the
 *  region detail page. The partner then launches it from their dashboard. */
export async function createPartnerSandbox(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const back = safeRegionFrom(String(formData.get("from") ?? REGIONS));
  if (!/^\d+$/.test(userId)) redirect(`${back}?error=sandbox-failed`);

  try {
    await provisionSandboxForUser(userId);
  } catch (e) {
    const code = e instanceof Error ? e.message : "error";
    redirect(`${back}?error=sandbox-${code === "exists" ? "exists" : "failed"}`);
  }
  revalidatePath(back);
  revalidatePath("/partner");
  revalidatePath("/", "layout");
  redirect(`${back}?done=sandbox-created`);
}

/** Tear down a partner's sandbox from the region detail page. Gated to test
 *  regions by teardownSandbox itself. */
export async function endPartnerSandbox(formData: FormData): Promise<void> {
  await requireAdmin();
  const regionId = String(formData.get("region_id") ?? "");
  const back = safeRegionFrom(String(formData.get("from") ?? REGIONS));
  if (!/^\d+$/.test(regionId)) redirect(back);

  await teardownSandbox(regionId);
  // If we were torn down from the sandbox region's OWN detail page, that
  // page no longer exists — fall back to the regions list instead of 404ing.
  const dest = back === `${REGIONS}/${regionId}` ? REGIONS : back;
  revalidatePath(REGIONS);
  revalidatePath("/partner");
  revalidatePath("/", "layout");
  redirect(`${dest}?done=sandbox-ended`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  provisionSandboxForApplication,
  teardownSandbox,
} from "@/lib/partner-sandbox";

const PATH = "/admin/partner-applications";

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

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { updateSiteSettings } from "@/lib/site-settings";

const PAGE_PATH = "/admin/site-settings";

export async function setAllowIndexing(formData: FormData): Promise<void> {
  await requireAdmin();
  // Checkbox semantics: if "on" is in the form data the box was ticked,
  // otherwise it was un-ticked.
  const allowIndexing = formData.get("allow_indexing") === "on";
  await updateSiteSettings({ allowIndexing });

  // The metadata layout function reads site_settings on every request,
  // and so does /robots.txt. Touch the root + robots so any cached
  // versions invalidate immediately.
  revalidatePath("/", "layout");
  revalidatePath("/robots.txt");

  redirect(`${PAGE_PATH}?saved=1`);
}

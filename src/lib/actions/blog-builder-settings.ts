"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  DEFAULT_BLOG_BUILDER_SETTINGS,
  updateBlogBuilderSettings,
  type BlogBuilderSettings,
} from "@/lib/blog-builder-settings";

const PAGE_PATH = "/admin/blog/builder/budgets";

function parseIntField(
  formData: FormData,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

export async function saveBlogBuilderSettings(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const next: BlogBuilderSettings = {
    voiceBudget: parseIntField(
      formData,
      "voiceBudget",
      100,
      10_000,
      DEFAULT_BLOG_BUILDER_SETTINGS.voiceBudget,
    ),
    humourBudget: parseIntField(
      formData,
      "humourBudget",
      100,
      10_000,
      DEFAULT_BLOG_BUILDER_SETTINGS.humourBudget,
    ),
    opinionsBudget: parseIntField(
      formData,
      "opinionsBudget",
      100,
      10_000,
      DEFAULT_BLOG_BUILDER_SETTINGS.opinionsBudget,
    ),
    statsBudget: parseIntField(
      formData,
      "statsBudget",
      100,
      10_000,
      DEFAULT_BLOG_BUILDER_SETTINGS.statsBudget,
    ),
    storiesBudget: parseIntField(
      formData,
      "storiesBudget",
      100,
      10_000,
      DEFAULT_BLOG_BUILDER_SETTINGS.storiesBudget,
    ),
    postMaxTokens: parseIntField(
      formData,
      "postMaxTokens",
      500,
      8192,
      DEFAULT_BLOG_BUILDER_SETTINGS.postMaxTokens,
    ),
    serpMaxTokens: parseIntField(
      formData,
      "serpMaxTokens",
      500,
      8192,
      DEFAULT_BLOG_BUILDER_SETTINGS.serpMaxTokens,
    ),
    clusterMaxTokens: parseIntField(
      formData,
      "clusterMaxTokens",
      500,
      4096,
      DEFAULT_BLOG_BUILDER_SETTINGS.clusterMaxTokens,
    ),
  };

  await updateBlogBuilderSettings(next);
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}

export async function resetBlogBuilderSettings(): Promise<void> {
  await requireAdmin();
  await updateBlogBuilderSettings(DEFAULT_BLOG_BUILDER_SETTINGS);
  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?reset=1`);
}

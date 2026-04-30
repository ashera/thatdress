"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  addRefRow,
  deleteRefRow,
  findRefTable,
  updateRefRow,
} from "@/lib/ref-data";

function intFromForm(formData: FormData, key: string, fallback: number): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function createRefRow(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("tableKey") ?? "");
  const t = findRefTable(key);
  if (!t) redirect("/admin/reference-data");

  const display = String(formData.get("display") ?? "").trim();
  if (!display) {
    redirect(`/admin/reference-data/${key}?error=missing-display`);
  }

  await addRefRow(t, {
    display,
    slug: String(formData.get("slug") ?? "").trim() || undefined,
    sort_order: intFromForm(formData, "sort_order", 0),
  });

  revalidatePath(`/admin/reference-data/${key}`);
  revalidatePath(`/admin/reference-data`);
  redirect(`/admin/reference-data/${key}`);
}

export async function editRefRow(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("tableKey") ?? "");
  const id = String(formData.get("id") ?? "");
  const t = findRefTable(key);
  if (!t) redirect("/admin/reference-data");

  const display = String(formData.get("display") ?? "").trim();
  if (!display) {
    redirect(`/admin/reference-data/${key}?error=missing-display`);
  }

  await updateRefRow(t, id, {
    display,
    sort_order: intFromForm(formData, "sort_order", 0),
    is_active: formData.get("is_active") === "on",
  });

  revalidatePath(`/admin/reference-data/${key}`);
  revalidatePath(`/admin/reference-data`);
  redirect(`/admin/reference-data/${key}`);
}

export async function removeRefRow(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("tableKey") ?? "");
  const id = String(formData.get("id") ?? "");
  const t = findRefTable(key);
  if (!t) redirect("/admin/reference-data");

  await deleteRefRow(t, id);

  revalidatePath(`/admin/reference-data/${key}`);
  revalidatePath(`/admin/reference-data`);
  redirect(`/admin/reference-data/${key}`);
}

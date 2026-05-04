"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const NAME_MAX = 80;

/** Pick only the params we care about for alerts (drop view/sort). */
function sanitizeParams(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "q",
    "designer_id",
    "occasion_id",
    "silhouette_id",
    "size_id",
    "condition_id",
    "min_price",
    "max_price",
    "mode",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!allowed.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const filtered = v.filter((s) => typeof s === "string" && s.length > 0);
      if (filtered.length > 0) out[k] = filtered;
    } else if (typeof v === "string" && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

export async function saveSearch(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/alerts");

  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX);
  const paramsRaw = String(formData.get("params_json") ?? "{}");

  if (!name) redirect("/alerts?error=missing-name");

  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(paramsRaw);
  } catch {
    params = {};
  }
  const cleaned = sanitizeParams(params);

  await query(
    `INSERT INTO saved_searches (user_id, name, params_json)
     VALUES ($1::bigint, $2, $3::jsonb)`,
    [user.id, name, JSON.stringify(cleaned)],
  );

  revalidatePath("/alerts");
  redirect("/alerts?saved=1");
}

export async function deleteSavedSearch(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) redirect("/alerts");

  await query(
    `DELETE FROM saved_searches WHERE id = $1::bigint AND user_id = $2::bigint`,
    [id, user.id],
  );

  revalidatePath("/alerts");
  redirect("/alerts");
}

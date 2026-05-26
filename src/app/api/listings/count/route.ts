import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  buildBrowseFilters,
  type RawBrowseParams,
} from "@/lib/browse-filters";

export const dynamic = "force-dynamic";

// Convert URLSearchParams into the same shape that the /listings
// page sees (string | string[] | undefined). Repeating keys like
// ?designer_id=1&designer_id=2 turn into a string[].
function paramsToRaw(sp: URLSearchParams): RawBrowseParams {
  const out: Record<string, string | string[]> = {};
  for (const key of sp.keys()) {
    if (key in out) continue;
    const values = sp.getAll(key).filter((v) => v.length > 0);
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out as RawBrowseParams;
}

/**
 * Live filter-result count for the browse page. Mirrors the WHERE
 * clause buildBrowseFilters constructs, but skips the SELECT
 * payload and runs a COUNT(*). Used by the LiveCount widget inside
 * the filter panel so the user sees how many listings their staged
 * selection matches before hitting Apply.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const raw = paramsToRaw(url.searchParams);

  const user = await getCurrentUser();
  const isAdmin = user?.isAdmin ?? false;

  try {
    const { whereSql, params } = await buildBrowseFilters(raw, {
      isAdmin,
      userId: user?.id ?? null,
    });

    const r = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers d ON d.id = dr.designer_id
        ${whereSql}`,
      params,
    );
    const count = Number(r.rows[0]?.count ?? 0);
    return NextResponse.json({ count });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/listings/count] failed", err);
    return NextResponse.json({ count: 0 }, { status: 500 });
  }
}

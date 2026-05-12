import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * Public postcode lookup — used by the wizard's price-and-location
 * input to show the suburb name as the seller types. Read-only,
 * postcode → suburb is open data (we shipped the GeoNames seed),
 * so no auth needed. Caching headers keep repeated hits cheap.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: rawCode } = await ctx.params;
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,8}$/.test(code)) {
    return NextResponse.json(
      { found: false, error: "invalid-format" },
      { status: 400 },
    );
  }
  try {
    const r = await query<{ place_name: string | null }>(
      `SELECT place_name FROM postcodes
        WHERE country_code = 'AU'
          AND postcode     = $1
        LIMIT 1`,
      [code],
    );
    const row = r.rows[0];
    if (!row) {
      return NextResponse.json(
        { found: false },
        { headers: { "cache-control": "public, max-age=300" } },
      );
    }
    return NextResponse.json(
      { found: true, place_name: row.place_name },
      { headers: { "cache-control": "public, max-age=86400" } },
    );
  } catch {
    return NextResponse.json(
      { found: false, error: "lookup-failed" },
      { status: 500 },
    );
  }
}

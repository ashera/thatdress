import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: { ok: boolean; error?: string; time?: string };
  try {
    const result = await query<{ now: string }>("SELECT NOW() as now");
    database = { ok: true, time: String(result.rows[0]?.now ?? "") };
  } catch (error) {
    database = {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }

  return NextResponse.json({ status: "ok", database });
}

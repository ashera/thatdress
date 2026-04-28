import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query<{ now: string }>("SELECT NOW() as now");
    return NextResponse.json({
      status: "ok",
      database: "connected",
      time: result.rows[0]?.now ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { status: "error", database: "disconnected", error: message },
      { status: 503 },
    );
  }
}

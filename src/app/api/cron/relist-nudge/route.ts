import { NextResponse } from "next/server";
import { runRelistNudgeBatch } from "@/lib/cron/relist-nudge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return new NextResponse("forbidden", { status: 403 });
  }

  try {
    const stats = await runRelistNudgeBatch();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "run failed" },
      { status: 500 },
    );
  }
}

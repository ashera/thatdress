import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type ImageRow = {
  bytes: Buffer;
  mime_type: string;
  byte_size: number;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(imageId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let row: ImageRow | undefined;
  try {
    const r = await query<ImageRow>(
      `SELECT bytes, mime_type, byte_size
         FROM listing_images
        WHERE id = $1::bigint AND listing_id = $2::bigint
        LIMIT 1`,
      [imageId, id],
    );
    row = r.rows[0];
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }

  if (!row) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(row.bytes), {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(row.byte_size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

import { NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@/lib/db";

type ImageRow = {
  bytes: Buffer;
  mime_type: string;
  byte_size: number;
};

/** Allowed thumbnail widths. Anything else falls back to the
 *  original-resolution path. Limiting to a fixed list (rather than
 *  letting any width through) keeps the image-cache surface bounded
 *  and stops a hostile caller from exhausting CPU by requesting a
 *  thousand random sizes. */
const ALLOWED_WIDTHS = new Set([200, 400, 800, 1200]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await ctx.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(imageId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Optional ?w=200|400|800|1200 thumbnail. Strict allowlist; any
  // other value (including malformed) falls back to the original.
  const wParam = new URL(req.url).searchParams.get("w");
  const targetWidth = wParam ? Number.parseInt(wParam, 10) : null;
  const wantThumb =
    targetWidth !== null && ALLOWED_WIDTHS.has(targetWidth);

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

  // Resize-on-demand. WebP every time — the listing card / detail
  // gallery covers iOS Safari 14+ and every modern browser, and the
  // size win over the original (often a 3-5MB iPhone JPEG) is huge.
  // Failure falls back to the original byte stream so a single bad
  // image doesn't take the whole detail page down.
  if (wantThumb) {
    try {
      const resized = await sharp(row.bytes)
        .rotate() // honour EXIF orientation before resizing
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return new NextResponse(new Uint8Array(resized), {
        status: 200,
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(resized.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // Fall through to original.
    }
  }

  return new NextResponse(new Uint8Array(row.bytes), {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(row.byte_size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const WIDTH = 1080;
const HEIGHT = 1350;

type ListingRow = {
  title: string;
  price_cents: number;
  is_published: boolean;
  is_draft: boolean;
  sold_at: string | null;
  designer_name: string | null;
  size_label: string | null;
  primary_image_bytes: Buffer | null;
  primary_image_mime: string | null;
};

/**
 * Admin-only Instagram-ready post card generator. Renders a 1080×1350
 * (Instagram's 4:5 portrait sweet spot) PNG with the listing's
 * primary photo as the dominant top portion and a frockd-branded
 * band at the bottom showing designer + size + price. Admin downloads
 * and posts manually via the Instagram app — programmatic posting is
 * a separate path that needs Meta's instagram_content_publish review.
 *
 * Caching: no-store. The image is generated fresh per request so an
 * admin updating the listing photo or price sees the change
 * immediately.
 */
let cachedLogoDataUrl: string | null | undefined;
async function getLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl !== undefined) return cachedLogoDataUrl;
  try {
    const path = join(process.cwd(), "public", "frockd-logo-new-tr-back.png");
    const bytes = await readFile(path);
    cachedLogoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

/**
 * Resize + JPEG-ify the listing photo so Satori can render it. Hard-
 * coded to the photo-band dimensions; oversized output is wasted
 * bytes during PNG composition.
 */
async function photoDataUrl(
  bytes: Buffer | null,
  mime: string | null,
): Promise<string | null> {
  if (!bytes || !mime) return null;
  try {
    const jpeg = await sharp(bytes)
      .resize(WIDTH, Math.round(HEIGHT * 0.78), {
        fit: "cover",
        position: "centre",
      })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Card image is public — every input (photo / price / title) is
  // already public on the listing detail page; the branded overlay
  // doesn't add private info. Filter SQL-side to live listings only
  // so we don't render marketing cards for drafts or sold dresses.
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  let row: ListingRow | null = null;
  try {
    const r = await query<ListingRow>(
      `SELECT l.title,
              l.price_cents,
              l.is_published,
              l.is_draft,
              l.sold_at::text,
              d.name  AS designer_name,
              ds.label AS size_label,
              img.bytes     AS primary_image_bytes,
              img.mime_type AS primary_image_mime
         FROM listings l
         JOIN dresses dr  ON dr.id = l.dress_id
         LEFT JOIN designers   d  ON d.id  = dr.designer_id
         LEFT JOIN dress_sizes ds ON ds.id = dr.size_id
         LEFT JOIN LATERAL (
           SELECT bytes, mime_type
             FROM listing_images
            WHERE listing_id = l.id
            ORDER BY is_primary DESC, position, id
            LIMIT 1
         ) img ON TRUE
        WHERE l.id           = $1::bigint
          AND l.is_draft     = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND l.trust_status <> 'flagged'
        LIMIT 1`,
      [id],
    );
    row = r.rows[0] ?? null;
  } catch {
    row = null;
  }
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const [photoUrl, logoUrl] = await Promise.all([
    photoDataUrl(row.primary_image_bytes, row.primary_image_mime),
    getLogoDataUrl(),
  ]);

  const designer = row.designer_name ?? "";
  const sizeNote = row.size_label ? `Size ${row.size_label}` : "";
  const titleLen = row.title.length;
  const titleSize = titleLen > 42 ? 44 : titleLen > 28 ? 52 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #f4f1ea 0%, #efe4d4 60%, #f4d1c4 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
        }}
      >
        {/* Photo band — top 78% */}
        <div
          style={{
            width: "100%",
            height: Math.round(HEIGHT * 0.78),
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg, #e6dfd5 0%, #efe4d4 60%, #f4d1c4 100%)",
            overflow: "hidden",
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={photoUrl}
              width={WIDTH}
              height={Math.round(HEIGHT * 0.78)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 36,
                fontFamily: "Courier New, monospace",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#867f76",
              }}
            >
              No photo
            </div>
          )}
        </div>

        {/* Bottom branded band — 22% */}
        <div
          style={{
            width: "100%",
            flex: 1,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "32px 56px",
            background: "#ffffff",
            borderTop: "2px solid rgba(28,24,22,0.06)",
            gap: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 0,
              flex: 1,
            }}
          >
            {designer && (
              <div
                style={{
                  fontFamily: "Courier New, monospace",
                  fontSize: 22,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#7a7470",
                }}
              >
                {designer}
              </div>
            )}
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 800,
                letterSpacing: "-0.025em",
                color: "#1c1816",
                lineHeight: 1.05,
              }}
            >
              {row.title}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  color: "#bd5e1c",
                  letterSpacing: "-0.02em",
                }}
              >
                {priceLabel(row.price_cents)}
              </div>
              {sizeNote && (
                <div
                  style={{
                    fontFamily: "Courier New, monospace",
                    fontSize: 18,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#3a342f",
                    background: "#f4f1ea",
                    border: "1px solid #e9e5df",
                    padding: "6px 14px",
                    borderRadius: 999,
                  }}
                >
                  {sizeNote}
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              flex: "0 0 auto",
              gap: 8,
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logoUrl} width={180} height={66} />
            ) : (
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                }}
              >
                frockd
              </div>
            )}
            <div
              style={{
                fontFamily: "Courier New, monospace",
                fontSize: 14,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#7a7470",
              }}
            >
              frockd.com.au
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `inline; filename="frockd-listing-${id}.png"`,
      },
    },
  );
}

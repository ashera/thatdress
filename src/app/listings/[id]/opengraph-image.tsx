import { ImageResponse } from "next/og";
import sharp from "sharp";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "frockd listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Row = {
  title: string;
  price_cents: number;
  is_published: boolean;
  is_draft: boolean;
  sold_at: string | null;
  designer_name: string | null;
  occasion_label: string | null;
  silhouette_label: string | null;
  size_label: string | null;
  color: string | null;
  condition_label: string | null;
  primary_image_bytes: Buffer | null;
  primary_image_mime: string | null;
};

/**
 * Next's ImageResponse uses Satori, which only renders PNG, JPEG, and
 * SVG bitmaps. Listing photos are commonly uploaded as WebP, which
 * Satori silently drops — leaving the photo half blank. Convert the
 * primary image to a downsized JPEG and embed it as a data URL so
 * the OG card always has the photo, regardless of source format.
 */
async function imageDataUrl(
  bytes: Buffer | null,
  mime: string | null,
): Promise<string | null> {
  if (!bytes || !mime) return null;
  try {
    // Resize to the photo-half dimensions (with cover crop) so we ship
    // ~30-100KB of image data instead of the full upload.
    const jpeg = await sharp(bytes)
      .resize(600, 630, { fit: "cover", position: "centre" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (err) {
    // Fall back to no image rather than throwing during OG generation.
    // eslint-disable-next-line no-console
    console.warn("[og-image] sharp conversion failed:", err);
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

export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let row: Row | null = null;
  try {
    const r = await query<Row>(
      `SELECT l.title,
              l.price_cents,
              l.is_published,
              l.is_draft,
              l.sold_at::text,
              d.name   AS designer_name,
              o.label  AS occasion_label,
              s.label  AS silhouette_label,
              ds.label AS size_label,
              l.color,
              cg.label AS condition_label,
              img.bytes     AS primary_image_bytes,
              img.mime_type AS primary_image_mime
         FROM listings l
         LEFT JOIN designers        d  ON d.id  = l.designer_id
         LEFT JOIN occasions        o  ON o.id  = l.occasion_id
         LEFT JOIN silhouettes      s  ON s.id  = l.silhouette_id
         LEFT JOIN dress_sizes      ds ON ds.id = l.size_id
         LEFT JOIN condition_grades cg ON cg.id = l.condition_id
         LEFT JOIN LATERAL (
           SELECT bytes, mime_type
             FROM listing_images
            WHERE listing_id = l.id
            ORDER BY is_primary DESC, position, id
            LIMIT 1
         ) img ON TRUE
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    row = r.rows[0] ?? null;
  } catch {
    row = null;
  }

  const photoUrl = row
    ? await imageDataUrl(row.primary_image_bytes, row.primary_image_mime)
    : null;

  const title = row?.title ?? "frockd listing";
  const price = row ? priceLabel(row.price_cents) : "";
  const condition = row?.condition_label ?? "";
  const subtitleParts: string[] = [];
  if (row?.designer_name) subtitleParts.push(row.designer_name);
  if (row?.silhouette_label) subtitleParts.push(row.silhouette_label);
  if (row?.size_label) subtitleParts.push(`size ${row.size_label}`);
  if (row?.color) subtitleParts.push(row.color);
  const subtitle = subtitleParts.join(" · ");
  const isSold = !!row?.sold_at;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f7f6f3",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
        }}
      >
        {/* Photo half (left) */}
        <div
          style={{
            width: 600,
            height: 630,
            display: "flex",
            position: "relative",
            background:
              "linear-gradient(135deg, #f4f1ea 0%, #e6dfd5 60%, #f4d1c4 100%)",
          }}
        >
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={photoUrl}
              width={600}
              height={630}
              style={{
                width: 600,
                height: 630,
                objectFit: "cover",
              }}
            />
          )}
          {!photoUrl && (
            <div
              style={{
                width: 600,
                height: 630,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#867f76",
                fontSize: 22,
                fontFamily: "Courier New, monospace",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              No photo yet
            </div>
          )}
          {isSold && (
            <div
              style={{
                position: "absolute",
                top: 32,
                left: 32,
                background: "#1c1816",
                color: "#ffffff",
                padding: "8px 18px",
                borderRadius: 999,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Sold
            </div>
          )}
        </div>

        {/* Text half (right) */}
        <div
          style={{
            width: 600,
            height: 630,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "56px 56px 48px",
          }}
        >
          {/* Brand mark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#3a342f",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "#1c1816",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              td
            </div>
            frockd
          </div>

          {/* Title block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {row?.occasion_label && (
              <div
                style={{
                  fontSize: 16,
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#7a7470",
                }}
              >
                {row.occasion_label}
              </div>
            )}
            <div
              style={{
                fontSize: title.length > 28 ? 48 : 60,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
                color: "#1c1816",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 22,
                  color: "#3a342f",
                  lineHeight: 1.35,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Price + condition footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "2px solid rgba(28,24,22,0.15)",
              paddingTop: 24,
            }}
          >
            <div
              style={{
                fontSize: 44,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "#bd5e1c",
              }}
            >
              {price}
            </div>
            {condition && (
              <div
                style={{
                  fontSize: 16,
                  fontFamily: "Courier New, monospace",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#3a342f",
                  background: "#ffffff",
                  border: "1px solid #e9e5df",
                  padding: "8px 14px",
                  borderRadius: 999,
                }}
              >
                {condition}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

import { ImageResponse } from "next/og";
import { headers } from "next/headers";
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
  primary_image_id: string | null;
};

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

async function resolveOrigin(): Promise<string> {
  // ImageResponse runs server-side; the image fetch needs an absolute
  // URL. Prefer the request's own host so the embedded image URL
  // matches the social card's referer.
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "https";
    const host = h.get("host");
    if (host) return `${proto}://${host}`;
  } catch {
    // Fall through.
  }
  const raw = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return `https://${raw}`;
  }
  return "https://www.frockd.com.au";
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
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id
         FROM listings l
         LEFT JOIN designers        d  ON d.id  = l.designer_id
         LEFT JOIN occasions        o  ON o.id  = l.occasion_id
         LEFT JOIN silhouettes      s  ON s.id  = l.silhouette_id
         LEFT JOIN dress_sizes      ds ON ds.id = l.size_id
         LEFT JOIN condition_grades cg ON cg.id = l.condition_id
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    row = r.rows[0] ?? null;
  } catch {
    row = null;
  }

  const origin = await resolveOrigin();
  const photoUrl =
    row?.primary_image_id
      ? `${origin}/api/listings/${id}/images/${row.primary_image_id}`
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

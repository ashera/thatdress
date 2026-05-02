import { ImageResponse } from "next/og";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "ebikeflip blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Row = {
  title: string;
  published_at: string | null;
  author_first_name: string | null;
  author_email: string | null;
};

function authorLabel(r: Row): string {
  if (r.author_first_name && r.author_first_name.trim()) {
    return r.author_first_name.trim();
  }
  if (r.author_email) {
    return r.author_email.split("@")[0] ?? "ebikeflip";
  }
  return "ebikeflip";
}

function formatDate(s: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default async function OgImage({
  params,
}: {
  params: { slug: string };
}) {
  let row: Row | null = null;
  try {
    const r = await query<Row>(
      `SELECT p.title,
              p.published_at::text,
              u.first_name AS author_first_name,
              u.email      AS author_email
         FROM blog_posts p
         LEFT JOIN users u ON u.id = p.author_id
        WHERE p.slug = $1
        LIMIT 1`,
      [params.slug],
    );
    row = r.rows[0] ?? null;
  } catch {
    row = null;
  }

  const title = row?.title ?? "ebikeflip blog";
  const meta = row
    ? `${authorLabel(row)} · ${formatDate(row.published_at)}`
    : "Stories from the secondhand eBike market";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #f7f6f3 0%, #ece6da 60%, #f4d089 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
          color: "#1c1816",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#3a342f",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#1c1816",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            eb
          </div>
          ebikeflip
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#1c1816",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#3a342f",
            }}
          >
            {meta}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "#3a342f",
            borderTop: "2px solid rgba(28,24,22,0.15)",
            paddingTop: 24,
          }}
        >
          <div>The peer-to-peer eBike marketplace</div>
          <div style={{ fontWeight: 600 }}>ebikeflip.com</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

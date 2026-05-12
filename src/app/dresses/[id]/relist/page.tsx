import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { startRelistFromDress } from "@/lib/actions/listing-wizard";
import { markDressKept } from "@/lib/actions/dresses";
import { Button } from "../../../_components/ui";

export const dynamic = "force-dynamic";

type Row = {
  dress_id: string;
  designer_name: string | null;
  model: string | null;
  year: number | null;
  size_label: string | null;
  color: string | null;
  disposition: string;
  // Title + primary image of the listing this dress was sold via,
  // used for context on the landing card. Pulled from the most
  // recent 'sold' event so we point at the actual purchase listing
  // even if there were earlier failed listings of the dress.
  via_listing_id: string | null;
  via_title: string | null;
  via_primary_image_id: string | null;
};

async function fetchDress(
  dressId: string,
  ownerId: string,
): Promise<Row | null> {
  if (!/^\d+$/.test(dressId)) return null;
  try {
    const r = await query<Row>(
      `SELECT d.id::text                         AS dress_id,
              des.name                            AS designer_name,
              d.model,
              d.year,
              ds.label                            AS size_label,
              d.color,
              d.disposition,
              sale.via_listing_id::text           AS via_listing_id,
              sale.via_title                      AS via_title,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = sale.via_listing_id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              )                                   AS via_primary_image_id
         FROM dresses d
         LEFT JOIN designers   des ON des.id = d.designer_id
         LEFT JOIN dress_sizes ds  ON ds.id  = d.size_id
         LEFT JOIN LATERAL (
           SELECT e.via_listing_id, l.title AS via_title
             FROM dress_ownership_events e
             JOIN listings l ON l.id = e.via_listing_id
            WHERE e.dress_id   = d.id
              AND e.to_user_id = d.current_owner_user_id
              AND e.event_type = 'sold'
            ORDER BY e.occurred_at DESC
            LIMIT 1
         ) sale ON TRUE
        WHERE d.id = $1::bigint
          AND d.current_owner_user_id = $2::bigint
        LIMIT 1`,
      [dressId, ownerId],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

function dressLabel(row: Row): string {
  return (
    [row.designer_name, row.model].filter(Boolean).join(" ") ||
    row.via_title ||
    "your dress"
  );
}

export default async function RelistDressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/dresses/${id}/relist`)}`);
  }

  const dress = await fetchDress(id, user.id);
  if (!dress) {
    return (
      <div className="page page--pad">
        <main style={{ maxWidth: 520, margin: "0 auto" }}>
          <p className="eyebrow">Relist</p>
          <h1 style={{ marginBottom: 8 }}>This dress isn&rsquo;t in your closet</h1>
          <p style={{ color: "var(--ink-3)" }}>
            We can&rsquo;t find a dress with this ID under your account.
            If you bought it on a different account, sign in there and
            try the link again.
          </p>
          <p style={{ marginTop: 24 }}>
            <Link href="/listings/mine" className="back-link">
              ← My listings
            </Link>
          </p>
        </main>
      </div>
    );
  }

  // If they've already moved on (relisted, kept, or it's gone), say
  // so rather than letting them double-trigger a state change.
  if (dress.disposition !== "in-use") {
    return (
      <div className="page page--pad">
        <main style={{ maxWidth: 520, margin: "0 auto" }}>
          <p className="eyebrow">Relist</p>
          <h1 style={{ marginBottom: 8 }}>Already handled</h1>
          <p style={{ color: "var(--ink-3)" }}>
            {dress.disposition === "available"
              ? "Looks like there's already a listing in motion for this dress. Pick up where you left off in My listings."
              : dress.disposition === "kept"
                ? "You marked this one as kept — we won't nudge you about it again."
                : "This dress is no longer trackable. No action needed."}
          </p>
          <p style={{ marginTop: 24 }}>
            <Link href="/listings/mine" className="back-link">
              ← My listings
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const label = dressLabel(dress);
  const subtitleParts = [
    dress.size_label && `size ${dress.size_label}`,
    dress.color,
    dress.year ? String(dress.year) : null,
  ].filter(Boolean);

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link href="/listings/mine" className="back-link">
          ← My listings
        </Link>

        <header style={{ margin: "0 0 var(--s-6)" }}>
          <p className="eyebrow">Relist</p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Pass on your {label}?
          </h1>
          <p style={{ color: "var(--ink-3)", margin: 0 }}>
            If your event has been and gone, someone else is hunting for
            exactly this dress right now. Most of the spec is already on
            file from when you bought it — you just need fresh photos,
            a price, and a quick condition check.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            gap: "var(--s-4)",
            alignItems: "center",
            marginBottom: "var(--s-6)",
            padding: "var(--s-4)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 80,
              aspectRatio: "3 / 4",
              flex: "0 0 auto",
              borderRadius: 8,
              overflow: "hidden",
              background: "var(--surface)",
              position: "relative",
            }}
          >
            {dress.via_primary_image_id && dress.via_listing_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/listings/${dress.via_listing_id}/images/${dress.via_primary_image_id}?w=200`}
                alt={label}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              {dress.designer_name ?? "Designer unknown"}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{label}</div>
            {subtitleParts.length > 0 && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-3)",
                  marginTop: 2,
                }}
              >
                {subtitleParts.join(" · ")}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <form action={startRelistFromDress}>
            <input type="hidden" name="dressId" value={dress.dress_id} />
            <Button type="submit" variant="primary" size="lg" iconRight="arrow">
              List it again
            </Button>
          </form>

          <form action={markDressKept}>
            <input type="hidden" name="dressId" value={dress.dress_id} />
            <Button type="submit" variant="ghost" size="sm">
              I&rsquo;m keeping it
            </Button>
          </form>
        </div>

        <p
          style={{
            marginTop: "var(--s-6)",
            fontSize: 13,
            color: "var(--ink-4)",
            lineHeight: 1.5,
          }}
        >
          Listing it again starts a fresh wizard with the spec already
          filled in. Marking it kept stops the relist nudges — you can
          still come back later if you change your mind.
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { forceRelistNudge } from "@/lib/actions/admin-dresses";
import { Button } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dresses — Admin" };

const NUDGE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  sent: {
    ok: true,
    text: "Relist-nudge email sent. Next nudge rescheduled 60 days out.",
  },
  "not-found": {
    ok: false,
    text: "Dress not found.",
  },
  "no-owner": {
    ok: false,
    text: "Dress has no current owner — nothing to nudge.",
  },
  "owner-suspended": {
    ok: false,
    text: "Owner account is suspended.",
  },
  "owner-unverified": {
    ok: false,
    text: "Owner email isn't verified.",
  },
  "no-email": {
    ok: false,
    text: "Owner has no email on file.",
  },
  "send-failed": {
    ok: false,
    text: "Email send failed — check the server logs.",
  },
};

type Row = {
  dress_id: string;
  designer_name: string | null;
  model: string | null;
  year: number | null;
  size_label: string | null;
  disposition: string;
  // Display-level disposition: 'available' is split into 'listed'
  // when there's a live published listing for the dress, and
  // 'drafted' when only a draft exists. Underlying column stays
  // 'available' so cron filters and relist logic don't change.
  display_disposition: string;
  owner_email: string | null;
  owner_first_name: string | null;
  owner_surname: string | null;
  next_relist_nudge_at: string | null;
  last_relist_nudge_sent_at: string | null;
  last_sold_at: string | null;
  // Front photo of the most recent listing of this dress, used as
  // the row thumbnail. Falls back to null when no listing has any
  // images yet (drafts pre-photo-step).
  thumb_listing_id: string | null;
  thumb_image_id: string | null;
};

async function fetchDresses(): Promise<Row[]> {
  try {
    const r = await query<Row>(
      `SELECT d.id::text                              AS dress_id,
              des.name                                 AS designer_name,
              d.model,
              d.year,
              ds.label                                 AS size_label,
              d.disposition,
              CASE
                WHEN d.disposition = 'available' AND EXISTS (
                  SELECT 1 FROM listings l
                   WHERE l.dress_id     = d.id
                     AND l.is_draft     = FALSE
                     AND l.is_published = TRUE
                     AND l.sold_at IS NULL
                ) THEN 'listed'
                WHEN d.disposition = 'available' THEN 'drafted'
                ELSE d.disposition
              END                                       AS display_disposition,
              u.email                                  AS owner_email,
              u.first_name                             AS owner_first_name,
              u.surname                                AS owner_surname,
              d.next_relist_nudge_at::text             AS next_relist_nudge_at,
              d.last_relist_nudge_sent_at::text        AS last_relist_nudge_sent_at,
              (
                SELECT MAX(occurred_at)::text
                  FROM dress_ownership_events
                 WHERE dress_id = d.id AND event_type = 'sold'
              )                                        AS last_sold_at,
              thumb.listing_id::text                   AS thumb_listing_id,
              thumb.image_id::text                     AS thumb_image_id
         FROM dresses d
         JOIN users u ON u.id = d.current_owner_user_id
         LEFT JOIN designers   des ON des.id = d.designer_id
         LEFT JOIN dress_sizes ds  ON ds.id  = d.size_id
         LEFT JOIN LATERAL (
           SELECT li.id AS image_id, li.listing_id
             FROM listings l
             JOIN listing_images li ON li.listing_id = l.id
            WHERE l.dress_id = d.id
            ORDER BY l.created_at DESC,
                     li.is_primary DESC, li.position, li.id
            LIMIT 1
         ) thumb ON TRUE
        ORDER BY
          CASE d.disposition
            WHEN 'in-use'     THEN 1
            WHEN 'available'  THEN 2
            WHEN 'kept'       THEN 3
            WHEN 'lost'       THEN 4
            ELSE 5
          END,
          -- Within the 'available' bucket, listed comes before
          -- drafted so live marketplace inventory groups together.
          CASE
            WHEN d.disposition = 'available' AND EXISTS (
              SELECT 1 FROM listings l
               WHERE l.dress_id     = d.id
                 AND l.is_draft     = FALSE
                 AND l.is_published = TRUE
                 AND l.sold_at IS NULL
            ) THEN 0 ELSE 1
          END,
          d.next_relist_nudge_at NULLS LAST,
          d.id DESC
        LIMIT 500`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function dispositionPill(d: string): { bg: string; fg: string; label: string } {
  switch (d) {
    case "in-use":
      return { bg: "#dcfce7", fg: "#166534", label: "In use" };
    case "listed":
      return { bg: "#cffafe", fg: "#155e75", label: "Listed" };
    case "drafted":
      return { bg: "#e5e7eb", fg: "#374151", label: "Drafted" };
    case "kept":
      return { bg: "#e0e7ff", fg: "#3730a3", label: "Kept" };
    case "lost":
      return { bg: "#fee2e2", fg: "#991b1b", label: "Lost" };
    default:
      return { bg: "#e5e7eb", fg: "#374151", label: d };
  }
}

function ownerLabel(row: Row): string {
  const name = [row.owner_first_name, row.owner_surname]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || row.owner_email || "(unknown)";
}

function dressLabel(row: Row): string {
  return (
    [row.designer_name, row.model].filter(Boolean).join(" ") ||
    "(no designer)"
  );
}

export default async function AdminDressesPage({
  searchParams,
}: {
  searchParams: Promise<{ nudge?: string; id?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const rows = await fetchDresses();

  const flash = sp.nudge ? NUDGE_MESSAGES[sp.nudge] : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 1080 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Dresses</p>
        <h1>Dresses with current owners</h1>
        <p className="sub">
          Every dress that&rsquo;s been sold to an attributed buyer
          shows up here. Use <strong>Send relist nudge</strong> to
          force-fire the email immediately, bypassing the 60-day
          cron schedule. Only dresses currently in <em>in use</em>
          are eligible — <em>kept</em> means the owner opted out,{" "}
          <em>listed</em> means there&rsquo;s already a live
          listing, <em>drafted</em> means a relist is in progress.
        </p>
      </header>

      {flash && (
        <p
          className={flash.ok ? "form-success" : "form-error"}
          style={{ marginBottom: "var(--s-5)" }}
        >
          {flash.text}
          {sp.id ? ` (dress #${sp.id})` : ""}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No owned dresses yet</h3>
          <p style={{ margin: 0 }}>
            Once a listing is closed with an attributed buyer the
            dress will appear here.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          {rows.map((row) => {
            const pill = dispositionPill(row.display_disposition);
            const eligible = row.disposition === "in-use";
            return (
              <li
                key={row.dress_id}
                className="form-card"
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: "var(--s-4)",
                  alignItems: "center",
                  padding: "var(--s-4)",
                }}
              >
                <Link
                  href={`/admin/dresses/${row.dress_id}`}
                  style={{
                    width: 72,
                    aspectRatio: "3 / 4",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--surface-sunken)",
                    position: "relative",
                    display: "block",
                  }}
                  aria-hidden
                  tabIndex={-1}
                >
                  {row.thumb_image_id && row.thumb_listing_id ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/listings/${row.thumb_listing_id}/images/${row.thumb_image_id}?w=200`}
                      alt=""
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--ink-4)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                      }}
                    >
                      No photo
                    </div>
                  )}
                </Link>
                <Link
                  href={`/admin/dresses/${row.dress_id}`}
                  style={{
                    minWidth: 0,
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: pill.bg,
                        color: pill.fg,
                      }}
                    >
                      {pill.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-4)",
                      }}
                    >
                      Dress #{row.dress_id}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, color: "var(--ink-1)" }}>
                    {dressLabel(row)}
                    {row.year ? (
                      <span
                        style={{ fontWeight: 400, color: "var(--ink-3)" }}
                      >
                        {" "}
                        · {row.year}
                      </span>
                    ) : null}
                    {row.size_label ? (
                      <span
                        style={{ fontWeight: 400, color: "var(--ink-3)" }}
                      >
                        {" "}
                        · size {row.size_label}
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--t-body-s)",
                      color: "var(--ink-3)",
                      marginTop: 4,
                    }}
                  >
                    Owner: {ownerLabel(row)}
                    {row.owner_email ? ` · ${row.owner_email}` : ""}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--ink-4)",
                      marginTop: 4,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Sold: {formatDate(row.last_sold_at)}
                    {" · "}
                    Next nudge: {formatDate(row.next_relist_nudge_at)}
                    {" · "}
                    Last sent: {formatDate(row.last_relist_nudge_sent_at)}
                  </div>
                </Link>
                <form action={forceRelistNudge}>
                  <input type="hidden" name="dressId" value={row.dress_id} />
                  <Button
                    type="submit"
                    variant={eligible ? "primary" : "ghost"}
                    size="sm"
                    disabled={!eligible}
                    title={
                      eligible
                        ? "Force-send a relist nudge to the current owner"
                        : `Not eligible — disposition is '${row.display_disposition}'`
                    }
                  >
                    Send relist nudge
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  sampleEmailSql,
  listingIsSampleSql,
  dressIsSampleSql,
  showSamplesFromParam,
} from "@/lib/admin-test-data";
import { SampleDataToggle } from "../_components/sample-data-toggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard — Admin" };

async function safeCount(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  try {
    const r = await query<{ count: string }>(sql, params);
    return Number(r.rows[0]?.count ?? 0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin/dashboard] count failed", sql, e);
    return 0;
  }
}

async function safeSum(
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  try {
    const r = await query<{ sum: string | null }>(sql, params);
    return Number(r.rows[0]?.sum ?? 0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin/dashboard] sum failed", sql, e);
    return 0;
  }
}

function priceFormat(cents: number): string {
  // Compact format: $1.5k once we cross $1,000, $1.2M once we
  // cross $1,000,000. Divisors are in cents — $1 = 100 cents, so
  // 'thousands of dollars' = cents / 100,000 and 'millions' =
  // cents / 100,000,000. Round to one decimal then strip a
  // trailing .0 so '$1.0k' renders as '$1k'.
  if (cents >= 100_000_000) {
    return `$${(Math.round(cents / 10_000_000) / 10)
      .toString()
      .replace(/\.0$/, "")}M`;
  }
  if (cents >= 100_000) {
    return `$${(Math.round(cents / 10_000) / 10)
      .toString()
      .replace(/\.0$/, "")}k`;
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function numberFormat(n: number): string {
  return new Intl.NumberFormat("en-AU").format(n);
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ samples?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const showSamples = showSamplesFromParam(sp.samples);

  // Default: exclude seeded sample/sandbox + test-region rows so the
  // headline numbers match what the consoles (which default-hide them) show
  // when you click a tile. The toggle flips it. TRUE is a no-op predicate.
  const notSampleUser = showSamples ? "TRUE" : `NOT ${sampleEmailSql("email")}`;
  const notSampleListing = showSamples
    ? "TRUE"
    : `NOT ${listingIsSampleSql("l")}`;
  const notSampleDress = showSamples ? "TRUE" : `NOT ${dressIsSampleSql("d")}`;

  const [
    totalUsers,
    verifiedUsers,
    suspendedUsers,
    newUsers7d,
    activeListings,
    soldListings,
    gmvCents,
    newListings7d,
    totalDresses,
    dressesInUse,
    listingsUnderReview,
    openTickets,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::text AS count FROM users WHERE ${notSampleUser}`),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM users
        WHERE email_verified_at IS NOT NULL
          AND suspended_at IS NULL
          AND ${notSampleUser}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM users
        WHERE suspended_at IS NOT NULL
          AND ${notSampleUser}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND ${notSampleUser}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM listings l
        WHERE l.is_draft = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND ${notSampleListing}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM listings l
        WHERE l.sold_at IS NOT NULL
          AND ${notSampleListing}`,
    ),
    safeSum(
      `SELECT COALESCE(SUM(l.price_cents), 0)::text AS sum FROM listings l
        WHERE l.sold_at IS NOT NULL
          AND ${notSampleListing}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM listings l
        WHERE l.is_draft = FALSE
          AND l.created_at >= NOW() - INTERVAL '7 days'
          AND ${notSampleListing}`,
    ),
    safeCount(`SELECT COUNT(*)::text AS count FROM dresses d WHERE ${notSampleDress}`),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM dresses d
        WHERE d.current_owner_user_id IS NOT NULL
          AND d.disposition = 'in-use'
          AND ${notSampleDress}`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM (
         SELECT 1 FROM listings l
          WHERE l.is_draft = FALSE
            AND (
              l.trust_status = 'flagged'
              OR EXISTS (
                SELECT 1 FROM listing_flags f
                  WHERE f.listing_id = l.id AND f.resolved_at IS NULL
              )
            )
            AND ${notSampleListing}
       ) x`,
    ),
    safeCount(
      `SELECT COUNT(*)::text AS count FROM support_tickets
        WHERE status = 'open'`,
    ),
  ]);

  // Carry the toggle state into the console drill-downs so they open in the
  // same mode (the users/listings/dresses consoles read ?samples=1).
  const sampleQs = showSamples ? "?samples=1" : "";

  const tiles: Tile[] = [
    {
      label: "Users · total",
      value: numberFormat(totalUsers),
      caption: `${numberFormat(verifiedUsers)} verified, ${numberFormat(suspendedUsers)} suspended`,
      href: `/admin/users${sampleQs}`,
      tone: "default",
    },
    {
      label: "Users · verified",
      value: numberFormat(verifiedUsers),
      caption:
        totalUsers > 0
          ? `${Math.round((verifiedUsers / totalUsers) * 100)}% of total`
          : "—",
      href: `/admin/users${sampleQs}`,
      tone: "default",
    },
    {
      label: "Users · new (7d)",
      value: numberFormat(newUsers7d),
      caption: "Sign-ups in the last 7 days",
      href: `/admin/users${sampleQs}`,
      tone: "default",
    },
    {
      label: "Users · suspended",
      value: numberFormat(suspendedUsers),
      caption: "Currently locked out",
      href: `/admin/users${sampleQs}`,
      tone: suspendedUsers > 0 ? "warn" : "default",
    },
    {
      label: "Listings · active",
      value: numberFormat(activeListings),
      caption: "Published, not sold",
      href: `/admin/listings${sampleQs}`,
      tone: "default",
    },
    {
      label: "Listings · sold",
      value: numberFormat(soldListings),
      caption: "All-time closed sales",
      href: `/admin/listings${sampleQs}`,
      tone: "default",
    },
    {
      label: "GMV (all-time)",
      value: priceFormat(gmvCents),
      caption: "Sum of sold-listing price",
      href: `/admin/listings${sampleQs}`,
      tone: "good",
    },
    {
      label: "Listings · new (7d)",
      value: numberFormat(newListings7d),
      caption: "Posted in the last 7 days",
      href: `/admin/listings${sampleQs}`,
      tone: "default",
    },
    {
      label: "Dresses · total",
      value: numberFormat(totalDresses),
      caption: "Garments tracked",
      href: `/admin/dresses${sampleQs}`,
      tone: "default",
    },
    {
      label: "Dresses · in use",
      value: numberFormat(dressesInUse),
      caption: "Owned, eligible for relist nudge",
      href: `/admin/dresses${sampleQs}`,
      tone: "default",
    },
    {
      label: "Listings under review",
      value: numberFormat(listingsUnderReview),
      caption: "Admin-flagged or open buyer reports",
      href: "/admin/listings/flagged",
      tone: listingsUnderReview > 0 ? "warn" : "default",
    },
    {
      label: "Support · open",
      value: numberFormat(openTickets),
      caption: "Tickets waiting for admin reply",
      href: "/admin/tickets",
      tone: openTickets > 0 ? "warn" : "default",
    },
  ];

  return (
    <div className="page admin-page" style={{ maxWidth: 1280 }}>
      <header
        className="admin-header"
        style={{
          marginBottom: "var(--s-4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>
            Admin · Dashboard
          </p>
          <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
          <p className="sub" style={{ margin: 0 }}>
            Vital signs at a glance — click any tile to drill into the
            underlying data.
          </p>
        </div>
        <SampleDataToggle show={showSamples} />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--s-3)",
        }}
      >
        {tiles.map((t) => (
          <DashTile key={t.label} tile={t} />
        ))}
      </div>
    </div>
  );
}

type Tile = {
  label: string;
  value: string;
  caption: string;
  href: string;
  tone: "default" | "good" | "warn";
};

function DashTile({ tile }: { tile: Tile }) {
  const palette =
    tile.tone === "warn"
      ? { bg: "#fef3c7", border: "#fcd34d", label: "#78350f", value: "#78350f" }
      : tile.tone === "good"
        ? {
            bg: "#ecfdf5",
            border: "#a7f3d0",
            label: "#065f46",
            value: "#065f46",
          }
        : {
            bg: "var(--surface)",
            border: "var(--hairline)",
            label: "var(--ink-4)",
            value: "var(--ink-1)",
          };
  return (
    <Link
      href={tile.href}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 8,
        padding: "var(--s-4)",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        color: "inherit",
        textDecoration: "none",
        minHeight: 120,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: palette.label,
        }}
      >
        {tile.label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: palette.value,
          lineHeight: 1,
        }}
      >
        {tile.value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--ink-3)",
          lineHeight: 1.4,
        }}
      >
        {tile.caption}
      </div>
    </Link>
  );
}

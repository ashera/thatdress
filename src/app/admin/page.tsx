import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import {
  runRelistNudgeBatch,
  type RelistNudgeRunStats,
} from "@/lib/cron/relist-nudge";
import {
  runSavedSearchDigest,
  type SavedSearchRunStats,
} from "@/lib/cron/saved-searches";

export const dynamic = "force-dynamic";

type JobOutcome<T> =
  | { ok: true; stats: T; ms: number }
  | { ok: false; error: string; ms: number };

async function timed<T>(fn: () => Promise<T>): Promise<JobOutcome<T>> {
  const start = Date.now();
  try {
    const stats = await fn();
    return { ok: true, stats, ms: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "unknown error",
      ms: Date.now() - start,
    };
  }
}

const ADMIN_LINKS: Array<{ href: string; title: string; desc: string }> = [
  {
    href: "/admin/dresses",
    title: "Dresses",
    desc: "Track dresses with current owners, monitor relist-nudge schedules, and force-send a nudge to a buyer on demand.",
  },
  {
    href: "/admin/listings",
    title: "All Listings",
    desc: "Search, sort, and drill into any listing — see who's messaged the seller and how active each listing is.",
  },
  {
    href: "/admin/listings/flagged",
    title: "Listings Under Review",
    desc: "Admin-flagged listings plus open buyer reports — read the reason, decide whether to flag, dismiss, or hide.",
  },
  {
    href: "/admin/reviews",
    title: "Seller Reviews",
    desc: "Moderate buyer reviews. Hide harmful ones from public profiles, resolve seller-flagged disputes.",
  },
  {
    href: "/admin/users",
    title: "Manage Users",
    desc: "View accounts, edit profiles, suspend, and DM users directly.",
  },
  {
    href: "/admin/referrals",
    title: "Referrals",
    desc: "See who's referring whom, and how many of those referrals have led to Verified listings.",
  },
  {
    href: "/admin/tickets",
    title: "Support Tickets",
    desc: "Triage open tickets and reply to users.",
  },
  {
    href: "/admin/blog",
    title: "Blog Management",
    desc: "Write articles to attract visitors and support SEO.",
  },
  {
    href: "/admin/reference-data",
    title: "Manage Reference Data",
    desc: "Edit shared lookup values used across the app.",
  },
  {
    href: "/admin/regions",
    title: "Manage Regions",
    desc: "Configure which geographical regions the site is available in.",
  },
  {
    href: "/admin/site-settings",
    title: "Site Settings",
    desc: "Block crawlers pre-launch, set the Verified-badge threshold, other site-wide switches.",
  },
  {
    href: "/admin/database",
    title: "Database Structure",
    desc: "Tables, descriptions, and current row counts.",
  },
  {
    href: "/admin/docs",
    title: "Project Documentation",
    desc: "Rendered view of README.md — stack, architecture, feature systems, deploy notes.",
  },
];

export default async function AdminHomePage() {
  await requireAdmin();

  // Piggyback the cron jobs onto every admin page load. Each
  // job's SQL filter is the rate limiter — already-nudged
  // dresses fall out of the candidate set for 60 days, and
  // already-emailed saved-searches keep their last_emailed_at
  // gate — so re-running on every load doesn't re-send. Card
  // below reports what actually happened on this load.
  const [relist, digest] = await Promise.all([
    timed<RelistNudgeRunStats>(runRelistNudgeBatch),
    timed<SavedSearchRunStats>(runSavedSearchDigest),
  ]);

  return (
    <div className="page admin-page">
      <header className="admin-header">
        <p className="eyebrow">Admin</p>
        <h1>Admin console</h1>
        <p className="sub">Tools for managing the marketplace.</p>
      </header>

      <section
        className="form-card"
        style={{
          marginBottom: "var(--s-6)",
          padding: "var(--s-4) var(--s-5)",
        }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Background jobs
        </h2>
        <p
          className="card-sub"
          style={{ marginTop: 0, marginBottom: "var(--s-3)" }}
        >
          These ran when you loaded this page. The per-row gates
          inside each job mean refreshing won&rsquo;t re-send anything.
        </p>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-2)",
          }}
        >
          <JobRow
            name="Relist nudge"
            outcome={relist}
            describe={(s) =>
              `${s.candidates} due · ${s.sent} sent${s.errors ? ` · ${s.errors} errors` : ""}`
            }
          />
          <JobRow
            name="Saved-search digest"
            outcome={digest}
            describe={(s) =>
              `${s.searches} active · ${s.sent} digests sent${s.errors ? ` · ${s.errors} errors` : ""}`
            }
          />
        </ul>
      </section>

      <ul className="admin-list">
        {ADMIN_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="admin-tile">
              <div className="admin-tile-body">
                <div className="admin-tile-title">{l.title}</div>
                <div className="admin-tile-desc">{l.desc}</div>
              </div>
              <span className="admin-tile-arrow" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobRow<T>({
  name,
  outcome,
  describe,
}: {
  name: string;
  outcome: JobOutcome<T>;
  describe: (stats: T) => string;
}) {
  const summary = outcome.ok
    ? describe(outcome.stats)
    : `failed — ${outcome.error}`;
  const dotColor = outcome.ok ? "#16a34a" : "#dc2626";
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        padding: "8px 0",
        borderBottom: "1px solid var(--hairline)",
        fontSize: 14,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dotColor,
          flex: "0 0 auto",
        }}
      />
      <span style={{ fontWeight: 600, color: "var(--ink-1)", minWidth: 180 }}>
        {name}
      </span>
      <span style={{ color: "var(--ink-2)", flex: 1 }}>{summary}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--ink-4)",
        }}
      >
        {outcome.ms}ms
      </span>
    </li>
  );
}

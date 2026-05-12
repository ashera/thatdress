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
    href: "/admin/dashboard",
    title: "Dashboard",
    desc: "Vital signs at a glance — users, listings, GMV, dresses, and operational queues. Each tile drills into the underlying data.",
  },
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
    href: "/admin/postcodes",
    title: "Postcodes",
    desc: "Import the GeoNames AU dataset to power the listings map view. Tracks coverage of live listings against centroid lookups.",
  },
  {
    href: "/admin/links",
    title: "Link manager",
    desc: "Inbound-link ledger — log every external page that links back to frockd, track whether each link is still alive, and group by source kind.",
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
  {
    href: "/admin/docs/flows",
    title: "Workflow Diagrams",
    desc: "Rendered Mermaid diagrams covering the major user journeys and system flows.",
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
          padding: "var(--s-5)",
          background: "#eff6ff",
          borderColor: "#bfdbfe",
        }}
      >
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Background jobs
        </h2>
        <p
          className="card-sub"
          style={{ marginTop: 0, marginBottom: "var(--s-4)" }}
        >
          These ran when you loaded this page. Each job is also wired
          to{" "}
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "1px 6px",
              background: "var(--surface-sunken)",
              borderRadius: 4,
            }}
          >
            /api/cron/...
          </code>{" "}
          for external schedulers (Bearer-authed via{" "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            CRON_SECRET
          </code>
          ). Refreshing this page is safe — per-row gates inside each
          job stop re-sends.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          <JobCard
            name="Relist nudge"
            description="Emails the current owner of any dress they bought 90+ days ago, asking if they want to re-list it. Drives the 'circular' part of the marketplace by surfacing dresses sitting unworn after their event."
            outcome={relist}
            metrics={(s) => [
              {
                label: "Due now",
                value: s.candidates,
                hint: "Dresses with disposition='in-use' whose next_relist_nudge_at has passed and weren't nudged in the last 60 days. Already-nudged dresses fall off this list automatically.",
              },
              {
                label: "Sent",
                value: s.sent,
                hint: "Emails Resend accepted. Each successful send rolls last_relist_nudge_sent_at and pushes next_relist_nudge_at +60 days.",
              },
              {
                label: "Errors",
                value: s.errors,
                hint: "Sends that failed (Resend down, owner missing email, account suspended). Check server logs.",
                emphasise: s.errors > 0,
              },
            ]}
          />
          <JobCard
            name="Saved-search digest"
            description="Emails users who've saved a search a digest of new listings matching their criteria since the last digest (or the past 24h on first run). Helps buyers come back when something they want appears."
            outcome={digest}
            metrics={(s) => [
              {
                label: "Active searches",
                value: s.searches,
                hint: "Saved searches owned by verified, non-suspended users. Every active search is checked on each run.",
              },
              {
                label: "Digests sent",
                value: s.sent,
                hint: "Searches that had ≥1 new match since their last_emailed_at. Searches with no new matches are skipped, no email goes out.",
              },
              {
                label: "Errors",
                value: s.errors,
                hint: "Failures during match query or email send. Check server logs.",
                emphasise: s.errors > 0,
              },
            ]}
          />
        </div>
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

type Metric = {
  label: string;
  value: number;
  hint: string;
  emphasise?: boolean;
};

function JobCard<T>({
  name,
  description,
  outcome,
  metrics,
}: {
  name: string;
  description: string;
  outcome: JobOutcome<T>;
  metrics: (stats: T) => Metric[];
}) {
  const dotColor = outcome.ok ? "#16a34a" : "#dc2626";
  const stats = outcome.ok ? metrics(outcome.stats) : null;
  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "var(--s-4)",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-3)",
          marginBottom: 6,
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
        <span
          style={{
            fontWeight: 700,
            color: "var(--ink-1)",
            fontSize: 15,
            flex: 1,
          }}
        >
          {name}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-4)",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--surface-sunken)",
          }}
          title="Time spent running this job on the current page load"
        >
          {outcome.ms}ms
        </span>
      </div>
      <p
        style={{
          margin: "0 0 var(--s-3)",
          color: "var(--ink-3)",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {stats ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "var(--s-3)",
          }}
        >
          {stats.map((m) => (
            <div
              key={m.label}
              style={{
                padding: "8px 10px",
                background: m.emphasise ? "#fef2f2" : "var(--surface-sunken)",
                border: `1px solid ${m.emphasise ? "#fecaca" : "var(--hairline)"}`,
                borderRadius: 8,
              }}
              title={m.hint}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: m.emphasise ? "#991b1b" : "var(--ink-4)",
                  marginBottom: 2,
                }}
              >
                {m.label}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: m.emphasise ? "#991b1b" : "var(--ink-1)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {m.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  lineHeight: 1.4,
                }}
              >
                {m.hint}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "8px 10px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#991b1b",
            fontSize: 13,
            lineHeight: 1.4,
          }}
        >
          <strong>Run failed.</strong>{" "}
          {!outcome.ok ? outcome.error : "unknown error"}
        </div>
      )}
    </div>
  );
}

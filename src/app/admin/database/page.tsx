import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type TableMeta = { group: string; desc: string };

const TABLE_DESCRIPTIONS: Record<string, TableMeta> = {
  // Auth & users
  users: {
    group: "Auth & users",
    desc: "User accounts — auth credentials, profile, admin flag, region.",
  },
  sessions: {
    group: "Auth & users",
    desc: "Active login sessions, cookie-bound. Removed on logout / expiry.",
  },
  password_reset_tokens: {
    group: "Auth & users",
    desc: "Single-use links emailed during a password reset.",
  },
  email_verification_tokens: {
    group: "Auth & users",
    desc: "Tokens issued at signup so users can confirm their email.",
  },
  email_change_tokens: {
    group: "Auth & users",
    desc: "Tokens for the change-email flow (verify the new address).",
  },

  // Marketplace
  listings: {
    group: "Marketplace",
    desc: "Dress listings posted by sellers — spec, price, status, region.",
  },
  listing_images: {
    group: "Marketplace",
    desc: "Photos attached to a listing, ordered for the gallery.",
  },
  listing_views: {
    group: "Marketplace",
    desc: "One row per listing pageview — drives view counts and analytics.",
  },
  conversations: {
    group: "Marketplace",
    desc: "Buyer/seller chat threads about a specific listing.",
  },
  messages: {
    group: "Marketplace",
    desc: "Individual messages inside a conversation.",
  },
  shortlists: {
    group: "Marketplace",
    desc: "Listings a user has favourited (the heart icon).",
  },
  offers: {
    group: "Marketplace",
    desc: "Formal offers from a buyer to a seller on a listing.",
  },
  saved_searches: {
    group: "Marketplace",
    desc: "Named filter sets users save and optionally get alerts for.",
  },

  // Reference data — listing dropdowns + geography
  regions: {
    group: "Reference data",
    desc: "Geographic regions the marketplace operates in.",
  },
  designers: {
    group: "Reference data",
    desc: "Dress designers / brands (Vera Wang, Marchesa, Carolina Herrera, …).",
  },
  occasions: {
    group: "Reference data",
    desc: "Occasion types — wedding-guest, black-tie, cocktail, prom, …",
  },
  silhouettes: {
    group: "Reference data",
    desc: "A-line, ball gown, mermaid, sheath, empire, …",
  },
  fabrics: {
    group: "Reference data",
    desc: "Silk, satin, chiffon, lace, tulle, velvet, …",
  },
  dress_sizes: {
    group: "Reference data",
    desc: "Letter sizes (XS–XXL) and US numeric (0–22).",
  },
  necklines: {
    group: "Reference data",
    desc: "V-neck, sweetheart, halter, strapless, …",
  },
  sleeve_styles: {
    group: "Reference data",
    desc: "Sleeveless, cap, short, long, spaghetti strap, …",
  },
  dress_lengths: {
    group: "Reference data",
    desc: "Mini, knee-length, midi, tea, floor-length.",
  },
  condition_grades: {
    group: "Reference data",
    desc: "New with tags, like-new, excellent, good, fair.",
  },

  // Support
  support_tickets: {
    group: "Support",
    desc: "User-raised support cases that admins triage.",
  },
  support_messages: {
    group: "Support",
    desc: "Replies inside a support ticket thread.",
  },

  // Blog
  blog_posts: {
    group: "Blog",
    desc: "Articles — drafts, scheduled, and published.",
  },
  blog_images: {
    group: "Blog",
    desc: "Hero and embedded images uploaded for blog posts.",
  },
  blog_tags: {
    group: "Blog",
    desc: "Curated tag taxonomy posts can be filed under.",
  },
  blog_post_tags: {
    group: "Blog",
    desc: "Many-to-many link between posts and tags.",
  },
  blog_post_views: {
    group: "Blog",
    desc: "Per-pageview log for blog posts (admin views excluded).",
  },

  // Blog Builder
  blog_keywords: {
    group: "Blog Builder",
    desc: "Keyword bank — search phrases queued for content.",
  },
  blog_clusters: {
    group: "Blog Builder",
    desc: "Keyword clusters — each maps to one article. Holds SERP analysis and last-gen response.",
  },
  blog_keyword_clusters: {
    group: "Blog Builder",
    desc: "Many-to-many link between clusters and member keywords.",
  },
  blog_cluster_images: {
    group: "Blog Builder",
    desc: "Pexels image candidates per cluster (primary + custom-keyword extras).",
  },
  blog_builder_settings: {
    group: "Blog Builder",
    desc: "Tunable prompt budgets and max_tokens caps used during blog generation. Single-row table managed at /admin/blog/builder/budgets.",
  },

  // Site-wide settings
  site_settings: {
    group: "Auth & users",
    desc: "Site-wide switches (e.g. allow_indexing). Single-row table managed at /admin/site-settings.",
  },
};

const GROUP_ORDER = [
  "Auth & users",
  "Marketplace",
  "Blog",
  "Blog Builder",
  "Reference data",
  "Support",
  "Other",
];

type CountRow = {
  name: string;
  count: number | null;
  error: string | null;
};

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/i;

async function fetchTablesAndCounts(): Promise<CountRow[]> {
  const tablesRes = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type   = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const tableNames = tablesRes.rows.map((r) => r.table_name);

  return Promise.all(
    tableNames.map(async (name): Promise<CountRow> => {
      // Names come from information_schema — defensive validation in case
      // somebody ever creates an unusually-named table by hand.
      if (!TABLE_NAME_RE.test(name)) {
        return { name, count: null, error: "invalid table name" };
      }
      try {
        const r = await query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM "${name}"`,
        );
        return { name, count: Number(r.rows[0]?.n ?? 0), error: null };
      } catch (e) {
        return {
          name,
          count: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
}

export default async function DatabaseStructurePage() {
  await requireAdmin();

  const counts = await fetchTablesAndCounts();

  const grouped = new Map<string, CountRow[]>();
  for (const row of counts) {
    const meta = TABLE_DESCRIPTIONS[row.name];
    const group = meta?.group ?? "Other";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(row);
  }

  const totalTables = counts.length;
  const totalRows = counts.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const undocumented = counts.filter((r) => !TABLE_DESCRIPTIONS[r.name]).length;

  return (
    <div className="page admin-page" style={{ maxWidth: 960 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Database</p>
        <h1>Database structure</h1>
        <p className="sub">
          {totalTables} tables · {totalRows.toLocaleString()} total rows · counts
          via <code>SELECT COUNT(*)</code>
          {undocumented > 0 ? ` · ${undocumented} undocumented` : ""}
        </p>
      </header>

      {GROUP_ORDER.map((group) => {
        const rows = grouped.get(group);
        if (!rows || rows.length === 0) return null;
        const groupTotal = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
        return (
          <section
            key={group}
            className="form-card"
            style={{ marginBottom: "var(--s-5)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "var(--s-3)",
                marginBottom: "var(--s-2)",
              }}
            >
              <h2 className="card-heading" style={{ margin: 0 }}>
                {group}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                {rows.length} tables · {groupTotal.toLocaleString()} rows
              </span>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {rows.map((row) => (
                <TableRow key={row.name} row={row} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TableRow({ row }: { row: CountRow }) {
  const meta = TABLE_DESCRIPTIONS[row.name];
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "var(--s-4)",
        alignItems: "center",
        padding: "var(--s-3) 0",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink-1)",
          }}
        >
          {row.name}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {meta?.desc ?? (
            <em style={{ color: "var(--ink-4)" }}>No description yet.</em>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", whiteSpace: "nowrap", minWidth: 80 }}>
        {row.error ? (
          <span
            title={row.error}
            style={{ color: "#a01818", fontSize: 12, fontWeight: 600 }}
          >
            error
          </span>
        ) : (
          <span
            style={{
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              color:
                (row.count ?? 0) > 0 ? "var(--ink-1)" : "var(--ink-4)",
            }}
          >
            {row.count?.toLocaleString() ?? "—"}
          </span>
        )}
        <div
          style={{
            fontSize: 10,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontFamily: "var(--font-mono)",
            marginTop: 2,
          }}
        >
          rows
        </div>
      </div>
    </li>
  );
}

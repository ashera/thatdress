import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { sampleEmailSql } from "@/lib/admin-test-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — Admin" };

type Row = {
  id: string;
  email: string;
  is_admin: boolean;
  is_partner: boolean;
  email_verified_at: string | null;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  created_at: string;
  suspended_at: string | null;
  listing_count: string;
  conversation_count: string;
};

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "admin", label: "Admins" },
  { value: "partner", label: "Partners" },
  { value: "member", label: "Members (non-admin/partner)" },
] as const;
type TypeValue = (typeof TYPE_OPTIONS)[number]["value"];

const SAMPLE_OPTIONS = [
  { value: "exclude", label: "Real users only" },
  { value: "all", label: "Include sample & test" },
  { value: "only", label: "Sample & test only" },
] as const;
type SampleValue = (typeof SAMPLE_OPTIONS)[number]["value"];

function fullName(r: Row): string {
  const parts = [r.first_name, r.surname].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" ") : "—";
}

function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

async function fetchRegions(): Promise<
  Array<{ id: string; label: string; is_test: boolean }>
> {
  try {
    const r = await query<{ id: string; label: string; is_test: boolean }>(
      `SELECT id::text, label, is_test
         FROM regions
        ORDER BY is_test, sort_order, label`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function fetchUsers(opts: {
  type: TypeValue;
  regionId: string | null;
  sample: SampleValue;
}): Promise<Row[]> {
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.type === "admin") where.push("u.is_admin = TRUE");
  else if (opts.type === "partner") where.push("u.is_partner = TRUE");
  else if (opts.type === "member")
    where.push("u.is_admin = FALSE AND u.is_partner = FALSE");

  if (opts.regionId) {
    params.push(opts.regionId);
    where.push(
      `EXISTS (SELECT 1 FROM listings l
                WHERE l.seller_id = u.id AND l.region_id = $${params.length}::bigint)`,
    );
  }

  // Sample/test users are identified by their seeded email marker.
  if (opts.sample === "exclude") where.push(`NOT ${sampleEmailSql("u.email")}`);
  else if (opts.sample === "only") where.push(sampleEmailSql("u.email"));

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const r = await query<Row>(
      `SELECT u.id::text,
              u.email,
              u.is_admin,
              u.is_partner,
              u.email_verified_at::text,
              u.first_name,
              u.surname,
              u.town,
              u.created_at::text,
              u.suspended_at::text,
              (SELECT COUNT(*)::text FROM listings WHERE seller_id = u.id) AS listing_count,
              (SELECT COUNT(*)::text FROM conversations
                WHERE buyer_id = u.id OR seller_id = u.id) AS conversation_count
         FROM users u
         ${whereSql}
         ORDER BY u.created_at DESC`,
      params,
    );
    return r.rows;
  } catch {
    return [];
  }
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-3)",
  marginBottom: 4,
};
const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--hairline)",
  fontSize: 14,
  background: "var(--surface)",
  color: "var(--ink-1)",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; region?: string; sample?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const type: TypeValue =
    (TYPE_OPTIONS.find((o) => o.value === sp.type)?.value as TypeValue) ?? "all";
  const sample: SampleValue =
    (SAMPLE_OPTIONS.find((o) => o.value === sp.sample)?.value as SampleValue) ??
    "exclude";
  const regionId =
    sp.region && /^\d+$/.test(sp.region) ? sp.region : null;

  const [regions, rows] = await Promise.all([
    fetchRegions(),
    fetchUsers({ type, regionId, sample }),
  ]);

  const hasFilters = type !== "all" || regionId !== null || sample !== "exclude";

  return (
    <div className="page admin-page" style={{ maxWidth: 1100 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Users</p>
        <h1>Users</h1>
        <p className="sub">
          {rows.length} shown ·{" "}
          {rows.filter((r) => r.is_admin).length} admin ·{" "}
          {rows.filter((r) => r.is_partner).length} partner ·{" "}
          {rows.filter((r) => r.suspended_at).length} suspended
        </p>
      </header>

      <form
        method="get"
        action="/admin/users"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: "var(--s-5)",
          padding: "var(--s-4)",
          background: "var(--surface-sunken)",
          borderRadius: 12,
          border: "1px solid var(--hairline)",
        }}
      >
        <label style={{ flex: "1 1 200px" }}>
          <span style={labelStyle}>User type</span>
          <select name="type" defaultValue={type} style={selectStyle}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 220px" }}>
          <span style={labelStyle}>Has listings in region</span>
          <select name="region" defaultValue={regionId ?? ""} style={selectStyle}>
            <option value="">Any region</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.is_test ? " (test)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: "1 1 200px" }}>
          <span style={labelStyle}>Sample / test</span>
          <select name="sample" defaultValue={sample} style={selectStyle}>
            {SAMPLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            background: "var(--ink-1)",
            color: "#fff",
            border: 0,
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
        {hasFilters && (
          <Link
            href="/admin/users"
            style={{
              alignSelf: "center",
              fontSize: 13,
              color: "var(--ink-3)",
              textDecoration: "underline",
            }}
          >
            Reset
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No users match</h3>
          <p style={{ margin: 0 }}>
            {hasFilters
              ? "Try a different combination of filters."
              : "No users yet."}
          </p>
        </div>
      ) : (
        <div className="users-table">
          <div className="users-row users-head">
            <div>Email</div>
            <div>Name</div>
            <div>Town</div>
            <div>Listings</div>
            <div>Threads</div>
            <div>Joined</div>
            <div>Status</div>
          </div>
          {rows.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className={`users-row users-item ${u.suspended_at ? "is-suspended" : ""}`}
            >
              <div className="users-email">
                {u.email}
                {u.is_admin && <span className="users-tag --admin">Admin</span>}
                {u.is_partner && (
                  <span className="users-tag --partner">Partner</span>
                )}
                {!u.email_verified_at && (
                  <span className="users-tag --susp">Unverified</span>
                )}
              </div>
              <div>{fullName(u)}</div>
              <div className="users-loc">{u.town ?? "—"}</div>
              <div>{u.listing_count}</div>
              <div>{u.conversation_count}</div>
              <div className="users-date">{formatDate(u.created_at)}</div>
              <div>
                {u.suspended_at ? (
                  <span className="users-tag --susp">Suspended</span>
                ) : (
                  <span className="users-tag --ok">Active</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

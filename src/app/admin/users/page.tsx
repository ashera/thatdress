import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  email: string;
  is_admin: boolean;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  created_at: string;
  suspended_at: string | null;
  listing_count: string;
  conversation_count: string;
};

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

export default async function AdminUsersPage() {
  await requireAdmin();

  const result = await query<Row>(
    `SELECT u.id::text,
            u.email,
            u.is_admin,
            u.first_name,
            u.surname,
            u.town,
            u.created_at::text,
            u.suspended_at::text,
            (SELECT COUNT(*)::text FROM listings WHERE seller_id = u.id) AS listing_count,
            (SELECT COUNT(*)::text FROM conversations
              WHERE buyer_id = u.id OR seller_id = u.id) AS conversation_count
       FROM users u
       ORDER BY u.created_at DESC`,
  );

  return (
    <div className="page admin-page" style={{ maxWidth: 1100 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Users</p>
        <h1>Users</h1>
        <p className="sub">
          {result.rows.length} total ·{" "}
          {result.rows.filter((r) => r.is_admin).length} admin ·{" "}
          {result.rows.filter((r) => r.suspended_at).length} suspended
        </p>
      </header>

      {result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No users yet</h3>
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
          {result.rows.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className={`users-row users-item ${u.suspended_at ? "is-suspended" : ""}`}
            >
              <div className="users-email">
                {u.email}
                {u.is_admin && <span className="users-tag --admin">Admin</span>}
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

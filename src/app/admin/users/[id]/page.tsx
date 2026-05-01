import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  sendAdminMessage,
  toggleAdminRole,
  toggleUserSuspended,
  updateUserAsAdmin,
} from "@/lib/actions/users";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const TITLES = ["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"];

const ERRORS: Record<string, string> = {
  "self-demote": "You can't change your own admin role.",
  "self-suspend": "You can't suspend your own account.",
  "empty-message": "Message body is empty.",
};

type UserRow = {
  id: string;
  email: string;
  is_admin: boolean;
  suspended_at: string | null;
  created_at: string;
  title: string | null;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  postcode: string | null;
  listing_count: string;
  conversation_count: string;
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requireAdmin();
  const { id } = await params;
  const { saved, error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  if (!/^\d+$/.test(id)) notFound();

  const result = await query<UserRow>(
    `SELECT u.id::text,
            u.email,
            u.is_admin,
            u.suspended_at::text,
            u.created_at::text,
            u.title,
            u.first_name,
            u.surname,
            u.town,
            u.postcode,
            (SELECT COUNT(*)::text FROM listings WHERE seller_id = u.id) AS listing_count,
            (SELECT COUNT(*)::text FROM conversations
              WHERE buyer_id = u.id OR seller_id = u.id) AS conversation_count
       FROM users u
      WHERE u.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const user = result.rows[0];
  if (!user) notFound();

  const isMe = user.id === me.id;
  const isSuspended = !!user.suspended_at;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/users" className="back-link">
        ← All users
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · User</p>
        <h1>{user.email}</h1>
        <p className="sub">
          Joined {formatDate(user.created_at)}
          {isSuspended ? ` · Suspended ${formatDate(user.suspended_at)}` : ""}
          {user.is_admin ? " · Admin" : ""}
          {isMe ? " · This is you" : ""}
        </p>
      </header>

      {saved && !errorMessage && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}
      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMessage}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Activity</h2>
        <div className="kv-list">
          <dt>Listings</dt>
          <dd>{user.listing_count}</dd>
          <dt>Conversations</dt>
          <dd>{user.conversation_count}</dd>
        </div>
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Profile</h2>
        <p className="card-sub">
          Edit on behalf of the user. Changes apply immediately.
        </p>

        <form
          action={updateUserAsAdmin}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          <input type="hidden" name="userId" value={user.id} />

          <div className="grid-2">
            <Field label="Title" htmlFor="title">
              <select
                id="title"
                name="title"
                className="input"
                defaultValue={user.title ?? ""}
              >
                <option value="">—</option>
                {TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <div />
          </div>

          <div className="grid-2">
            <Field label="First name" htmlFor="first_name">
              <Input
                id="first_name"
                name="first_name"
                maxLength={64}
                defaultValue={user.first_name ?? ""}
              />
            </Field>
            <Field label="Surname" htmlFor="surname">
              <Input
                id="surname"
                name="surname"
                maxLength={64}
                defaultValue={user.surname ?? ""}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Town / city" htmlFor="town">
              <Input
                id="town"
                name="town"
                maxLength={64}
                defaultValue={user.town ?? ""}
              />
            </Field>
            <Field label="Postcode" htmlFor="postcode">
              <Input
                id="postcode"
                name="postcode"
                maxLength={16}
                defaultValue={user.postcode ?? ""}
              />
            </Field>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Save profile
            </Button>
          </div>
        </form>
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Account controls</h2>
        <p className="card-sub">
          Suspending kills active sessions and blocks login. Toggle admin
          carefully — admins can manage other accounts.
        </p>

        <div className="account-controls">
          <form action={toggleAdminRole}>
            <input type="hidden" name="userId" value={user.id} />
            <Button type="submit" variant="ghost" disabled={isMe}>
              {user.is_admin ? "Revoke admin role" : "Make admin"}
            </Button>
          </form>
          <form action={toggleUserSuspended}>
            <input type="hidden" name="userId" value={user.id} />
            <Button
              type="submit"
              variant={isSuspended ? "primary" : "dark"}
              disabled={isMe}
            >
              {isSuspended ? "Unsuspend account" : "Suspend account"}
            </Button>
          </form>
        </div>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Send a message</h2>
        <p className="card-sub">
          Opens a direct admin thread with this user (separate from any
          listing conversations).
        </p>

        <form
          action={sendAdminMessage}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <input type="hidden" name="userId" value={user.id} />
          <Textarea
            name="body"
            rows={4}
            maxLength={4000}
            placeholder="Write a note to this user…"
            required
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" iconRight="arrow">
              Send & open thread
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

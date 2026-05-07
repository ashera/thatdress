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
import { startImpersonation } from "@/lib/actions/impersonation";
import { listReferredUsers } from "@/lib/referral";
import { loadSiteSettings } from "@/lib/site-settings";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const dynamic = "force-dynamic";

const TITLES = ["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"];

const ERRORS: Record<string, string> = {
  "self-demote": "You can't change your own admin role.",
  "self-suspend": "You can't suspend your own account.",
  "empty-message": "Message body is empty.",
  "self-impersonate": "You can't impersonate yourself.",
  "cannot-impersonate-suspended":
    "Suspended accounts can't be impersonated. Unsuspend first.",
};

type UserRow = {
  id: string;
  email: string;
  is_admin: boolean;
  email_verified_at: string | null;
  suspended_at: string | null;
  created_at: string;
  title: string | null;
  first_name: string | null;
  surname: string | null;
  town: string | null;
  postcode: string | null;
  listing_count: string;
  conversation_count: string;
  referral_code: string | null;
  referred_at: string | null;
  referrer_id: string | null;
  referrer_email: string | null;
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
            u.email_verified_at::text,
            u.suspended_at::text,
            u.created_at::text,
            u.title,
            u.first_name,
            u.surname,
            u.town,
            u.postcode,
            u.referral_code,
            u.referred_at::text,
            u.referred_by_user_id::text AS referrer_id,
            ru.email                    AS referrer_email,
            (SELECT COUNT(*)::text FROM listings WHERE seller_id = u.id) AS listing_count,
            (SELECT COUNT(*)::text FROM conversations
              WHERE buyer_id = u.id OR seller_id = u.id) AS conversation_count
       FROM users u
       LEFT JOIN users ru ON ru.id = u.referred_by_user_id
      WHERE u.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const user = result.rows[0];
  if (!user) notFound();

  // Referral programme info — both who they were referred by, and who
  // they've referred. Loaded in parallel with site settings so we can
  // multiply through to per-row earnings.
  const [referred, settings] = await Promise.all([
    listReferredUsers(user.id),
    loadSiteSettings(),
  ]);
  const commissionCents = settings.referralCommissionCents;
  const verifiedListings = referred.reduce(
    (sum, r) => sum + r.verified_listing_count,
    0,
  );
  const earnedCents = verifiedListings * commissionCents;

  const isMe = user.id === me.id;
  const isSuspended = !!user.suspended_at;

  return (
    <div className="page admin-page" style={{ maxWidth: 720 }}>
      <Link href="/admin/users" className="back-link">
        ← All users
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · User</p>
        <h1>
          {user.email}{" "}
          {user.email_verified_at ? (
            <span className="users-tag --ok">Verified</span>
          ) : (
            <span className="users-tag --susp">Unverified</span>
          )}
        </h1>
        <p className="sub">
          Joined {formatDate(user.created_at)}
          {user.email_verified_at
            ? ` · Verified ${formatDate(user.email_verified_at)}`
            : ""}
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
        <h2 className="card-heading">Referrals</h2>
        <div className="kv-list">
          <dt>Their referral code</dt>
          <dd>
            {user.referral_code ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.08em",
                }}
              >
                {user.referral_code}
              </span>
            ) : (
              <span style={{ color: "var(--ink-4)" }}>(not generated)</span>
            )}
          </dd>
          <dt>Referred by</dt>
          <dd>
            {user.referrer_id && user.referrer_email ? (
              <Link
                href={`/admin/users/${user.referrer_id}`}
                style={{
                  color: "var(--ink-1)",
                  textDecoration: "underline",
                  textDecorationColor: "var(--hairline-strong)",
                  textUnderlineOffset: 3,
                }}
              >
                {user.referrer_email}
              </Link>
            ) : (
              <span style={{ color: "var(--ink-4)" }}>—</span>
            )}
          </dd>
          <dt>Referrals signed up</dt>
          <dd>{referred.length}</dd>
          <dt>Verified listings from referrals</dt>
          <dd>{verifiedListings}</dd>
          <dt>Outstanding commission</dt>
          <dd>{priceLabel(earnedCents)}</dd>
        </div>

        {referred.length > 0 ? (
          <div
            style={{
              marginTop: "var(--s-4)",
              border: "1px solid var(--hairline)",
              borderRadius: 10,
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead
                style={{
                  background: "var(--surface-sunken)",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <tr>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                    }}
                  >
                    Referred user
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      width: 120,
                    }}
                  >
                    Joined
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      width: 90,
                    }}
                  >
                    Listings
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      width: 90,
                    }}
                  >
                    Verified
                  </th>
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                      width: 110,
                    }}
                  >
                    Earned
                  </th>
                </tr>
              </thead>
              <tbody>
                {referred.map((r, i) => {
                  const earned = r.verified_listing_count * commissionCents;
                  return (
                    <tr
                      key={r.id}
                      className="admin-listings-row"
                      style={{
                        borderBottom:
                          i === referred.length - 1
                            ? "none"
                            : "1px solid var(--hairline)",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <Link
                          href={`/admin/users/${r.id}`}
                          style={{
                            fontWeight: 600,
                            color: "var(--ink-1)",
                            textDecoration: "underline",
                            textDecorationColor:
                              "var(--hairline-strong)",
                            textUnderlineOffset: 3,
                          }}
                        >
                          {r.email}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontSize: 12,
                          color: "var(--ink-3)",
                        }}
                      >
                        {formatDate(r.signed_up_at)}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.listing_count}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color:
                            r.verified_listing_count > 0
                              ? "#92400e"
                              : "var(--ink-4)",
                        }}
                      >
                        {r.verified_listing_count}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          color:
                            earned > 0 ? "var(--ink-1)" : "var(--ink-4)",
                        }}
                      >
                        {priceLabel(earned)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p
            style={{
              marginTop: "var(--s-3)",
              color: "var(--ink-3)",
              fontSize: 14,
            }}
          >
            This user hasn&rsquo;t referred anyone yet.
          </p>
        )}
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
          <form action={startImpersonation}>
            <input type="hidden" name="targetUserId" value={user.id} />
            <Button
              type="submit"
              variant="dark"
              disabled={isMe || isSuspended}
              title={
                isMe
                  ? "You can't impersonate yourself."
                  : isSuspended
                  ? "Unsuspend the account first."
                  : "Open the site as this user — switch back via the menu bar."
              }
            >
              Log in as this user
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

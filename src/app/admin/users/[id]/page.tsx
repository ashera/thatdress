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
import {
  Button,
  ButtonLink,
  Field,
  Input,
  Textarea,
} from "../../../_components/ui";

type AdminReviewRow = {
  id: string;
  buyer_id: string;
  buyer_email: string | null;
  listing_id: string;
  listing_title: string | null;
  stars: number;
  body: string | null;
  as_described: boolean | null;
  easy_communication: boolean | null;
  smooth_handover: boolean | null;
  created_at: string;
  edited_at: string | null;
  hidden_by_admin_at: string | null;
  flagged_at: string | null;
};

type ReviewSummaryAll = {
  total: number;
  visible: number;
  hidden: number;
  flagged: number;
  average: number;
};

/**
 * Admin-scoped review history for a seller. Unlike
 * getSellerReviewSummary / listSellerReviews — which filter out
 * admin-hidden rows for the public view — this one returns every
 * review against the seller, including hidden + flagged ones, so
 * an admin can audit moderation decisions and see what buyers
 * actually said. The summary's average is computed over visible
 * reviews only (the public-facing number).
 */
async function fetchAdminSellerReviews(
  sellerId: string,
): Promise<{ rows: AdminReviewRow[]; summary: ReviewSummaryAll }> {
  if (!/^\d+$/.test(sellerId)) {
    return {
      rows: [],
      summary: { total: 0, visible: 0, hidden: 0, flagged: 0, average: 0 },
    };
  }
  try {
    const r = await query<AdminReviewRow>(
      `SELECT r.id::text,
              r.buyer_id::text,
              u.email                AS buyer_email,
              r.listing_id::text,
              l.title                AS listing_title,
              r.stars,
              r.body,
              r.as_described,
              r.easy_communication,
              r.smooth_handover,
              r.created_at::text,
              r.edited_at::text,
              r.hidden_by_admin_at::text,
              r.flagged_at::text
         FROM listing_reviews r
         LEFT JOIN users    u ON u.id = r.buyer_id
         LEFT JOIN listings l ON l.id = r.listing_id
        WHERE r.seller_id = $1::bigint
        ORDER BY r.created_at DESC
        LIMIT 200`,
      [sellerId],
    );
    const rows = r.rows;
    let total = 0;
    let hidden = 0;
    let flagged = 0;
    let starsTotal = 0;
    let visibleCount = 0;
    for (const row of rows) {
      total++;
      if (row.hidden_by_admin_at) hidden++;
      if (row.flagged_at && !row.hidden_by_admin_at) flagged++;
      if (!row.hidden_by_admin_at) {
        visibleCount++;
        starsTotal += row.stars;
      }
    }
    const average =
      visibleCount > 0
        ? Math.round((starsTotal / visibleCount) * 10) / 10
        : 0;
    return {
      rows,
      summary: { total, visible: visibleCount, hidden, flagged, average },
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin/users] fetchAdminSellerReviews failed", e);
    return {
      rows: [],
      summary: { total: 0, visible: 0, hidden: 0, flagged: 0, average: 0 },
    };
  }
}

type ConversationRow = {
  id: string;
  buyer_id: string;
  buyer_email: string | null;
  buyer_first_name: string | null;
  buyer_surname: string | null;
  seller_id: string;
  seller_email: string | null;
  seller_first_name: string | null;
  seller_surname: string | null;
  listing_id: string | null;
  listing_title: string | null;
  message_count: string;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  unread_for_user: string;
};

async function fetchUserConversations(
  userId: string,
): Promise<ConversationRow[]> {
  if (!/^\d+$/.test(userId)) return [];
  try {
    const r = await query<ConversationRow>(
      `SELECT c.id::text,
              c.buyer_id::text,
              bu.email                         AS buyer_email,
              bu.first_name                    AS buyer_first_name,
              bu.surname                       AS buyer_surname,
              c.seller_id::text,
              su.email                         AS seller_email,
              su.first_name                    AS seller_first_name,
              su.surname                       AS seller_surname,
              c.listing_id::text               AS listing_id,
              l.title                          AS listing_title,
              (
                SELECT COUNT(*)::text FROM messages m WHERE m.conversation_id = c.id
              )                                AS message_count,
              last.created_at::text            AS last_message_at,
              last.body                        AS last_message_body,
              last.sender_id::text             AS last_message_sender_id,
              (
                SELECT COUNT(*)::text FROM messages m
                  WHERE m.conversation_id = c.id
                    AND m.sender_id <> $1::bigint
                    AND m.read_at IS NULL
              )                                AS unread_for_user
         FROM conversations c
         LEFT JOIN users     bu ON bu.id = c.buyer_id
         LEFT JOIN users     su ON su.id = c.seller_id
         LEFT JOIN listings  l  ON l.id  = c.listing_id
         LEFT JOIN LATERAL (
           SELECT m.body, m.created_at, m.sender_id
             FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) last ON TRUE
        WHERE c.buyer_id = $1::bigint OR c.seller_id = $1::bigint
        ORDER BY COALESCE(last.created_at, c.updated_at) DESC
        LIMIT 100`,
      [userId],
    );
    return r.rows;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[admin/users] fetchUserConversations failed", e);
    return [];
  }
}

function userDisplay(
  email: string | null,
  first: string | null,
  surname: string | null,
): string {
  const name = [first, surname].filter(Boolean).join(" ").trim();
  return name || email || "(unknown)";
}

function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function formatReviewDate(s: string): string {
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

function chipState(v: boolean | null): {
  bg: string;
  fg: string;
  label: string;
} {
  if (v === true) return { bg: "#dcfce7", fg: "#166534", label: "Yes" };
  if (v === false) return { bg: "#fee2e2", fg: "#991b1b", label: "No" };
  return { bg: "#e5e7eb", fg: "#6b7280", label: "—" };
}

function StarBar({ stars }: { stars: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <span
      aria-label={`${stars} out of 5 stars`}
      style={{ letterSpacing: "0.06em", fontSize: 14 }}
    >
      <span style={{ color: "#f59e0b" }}>{"★".repeat(filled)}</span>
      <span style={{ color: "#d1d5db" }}>{"★".repeat(5 - filled)}</span>
    </span>
  );
}

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
  const [referred, settings, reviewHistory, conversations] = await Promise.all([
    listReferredUsers(user.id),
    loadSiteSettings(),
    fetchAdminSellerReviews(user.id),
    fetchUserConversations(user.id),
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
    <div className="page admin-page" style={{ maxWidth: "100%" }}>
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
        <h2 className="card-heading">Conversations</h2>
        {conversations.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-3)" }}>
            No conversations yet.
          </p>
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
            {conversations.map((c) => {
              const isBuyer = c.buyer_id === user.id;
              const counterpartId = isBuyer ? c.seller_id : c.buyer_id;
              const counterpart = userDisplay(
                isBuyer ? c.seller_email : c.buyer_email,
                isBuyer ? c.seller_first_name : c.buyer_first_name,
                isBuyer ? c.seller_surname : c.buyer_surname,
              );
              const role = isBuyer
                ? { bg: "#e0e7ff", fg: "#3730a3", label: "Buyer" }
                : { bg: "#dcfce7", fg: "#166534", label: "Seller" };
              const unread = Number(c.unread_for_user ?? 0);
              const messageCount = Number(c.message_count ?? 0);
              const sentByUser =
                c.last_message_sender_id === user.id;
              return (
                <li
                  key={c.id}
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    paddingTop: "var(--s-3)",
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
                        background: role.bg,
                        color: role.fg,
                      }}
                    >
                      {role.label}
                    </span>
                    {!c.listing_id && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fef3c7",
                          color: "#92400e",
                        }}
                      >
                        Admin DM
                      </span>
                    )}
                    {unread > 0 && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#991b1b",
                        }}
                      >
                        {unread} unread
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--ink-4)",
                      }}
                    >
                      {messageCount} message{messageCount === 1 ? "" : "s"}
                      {c.last_message_at
                        ? ` · ${formatReviewDate(c.last_message_at)}`
                        : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--ink-3)",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: "var(--ink-4)" }}>With</span>{" "}
                    <Link
                      href={`/admin/users/${counterpartId}`}
                      style={{
                        color: "var(--ink-2)",
                        textDecoration: "underline",
                        textDecorationColor: "var(--hairline-strong)",
                      }}
                    >
                      {counterpart}
                    </Link>
                    {c.listing_id && (
                      <>
                        {" "}
                        <span style={{ color: "var(--ink-4)" }}>about</span>{" "}
                        {c.listing_title ? (
                          <Link
                            href={`/listings/${c.listing_id}`}
                            style={{
                              color: "var(--ink-2)",
                              textDecoration: "underline",
                              textDecorationColor: "var(--hairline-strong)",
                            }}
                          >
                            {c.listing_title}
                          </Link>
                        ) : (
                          <span style={{ color: "var(--ink-4)" }}>
                            (listing deleted)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {c.last_message_body && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "var(--ink-2)",
                        lineHeight: 1.45,
                        background: "var(--surface-sunken)",
                        border: "1px solid var(--hairline)",
                        borderRadius: 8,
                        padding: "8px 10px",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: "var(--ink-4)",
                          marginRight: 6,
                        }}
                      >
                        {sentByUser ? "Sent →" : "← Received"}
                      </span>
                      {truncate(c.last_message_body)}
                    </p>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginTop: "var(--s-2)",
                    }}
                  >
                    <ButtonLink
                      href={`/messages/${c.id}`}
                      variant="ghost"
                      size="sm"
                      iconRight="arrow"
                    >
                      View details
                    </ButtonLink>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
        <h2 className="card-heading">Seller ratings</h2>
        {reviewHistory.summary.total === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-3)" }}>
            No reviews left for this user as a seller yet.
          </p>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "var(--s-3)",
                flexWrap: "wrap",
                marginBottom: "var(--s-3)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 36,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "var(--ink-1)",
                    lineHeight: 1,
                  }}
                >
                  {reviewHistory.summary.average.toFixed(1)}
                </span>
                <span style={{ color: "var(--ink-3)" }}>/ 5</span>
              </div>
              <StarBar stars={reviewHistory.summary.average} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                {reviewHistory.summary.visible} public
                {reviewHistory.summary.hidden > 0
                  ? ` · ${reviewHistory.summary.hidden} hidden`
                  : ""}
                {reviewHistory.summary.flagged > 0
                  ? ` · ${reviewHistory.summary.flagged} flagged`
                  : ""}
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--ink-4)",
                margin: "0 0 var(--s-3)",
              }}
            >
              Public average is computed over visible reviews only;
              hidden reviews are excluded from the seller&rsquo;s
              public profile but kept here for audit. Use{" "}
              <Link
                href="/admin/reviews"
                style={{
                  color: "var(--ink-2)",
                  textDecoration: "underline",
                }}
              >
                /admin/reviews
              </Link>{" "}
              to moderate (hide / un-hide).
            </p>

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
              {reviewHistory.rows.map((rev) => {
                const moderation: { bg: string; fg: string; label: string } | null =
                  rev.hidden_by_admin_at
                    ? { bg: "#fee2e2", fg: "#991b1b", label: "Hidden" }
                    : rev.flagged_at
                      ? { bg: "#fef3c7", fg: "#92400e", label: "Flagged" }
                      : null;
                return (
                  <li
                    key={rev.id}
                    style={{
                      borderTop: "1px solid var(--hairline)",
                      paddingTop: "var(--s-3)",
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
                      <StarBar stars={rev.stars} />
                      {moderation && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: moderation.bg,
                            color: moderation.fg,
                          }}
                        >
                          {moderation.label}
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-4)",
                        }}
                      >
                        {formatReviewDate(rev.created_at)}
                        {rev.edited_at ? " · edited" : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--ink-3)",
                        marginBottom: 4,
                      }}
                    >
                      {rev.listing_title ? (
                        <Link
                          href={`/listings/${rev.listing_id}`}
                          style={{
                            color: "var(--ink-2)",
                            textDecoration: "underline",
                            textDecorationColor: "var(--hairline-strong)",
                          }}
                        >
                          {rev.listing_title}
                        </Link>
                      ) : (
                        <span style={{ color: "var(--ink-4)" }}>
                          (listing deleted)
                        </span>
                      )}{" "}
                      <span style={{ color: "var(--ink-4)" }}>· by</span>{" "}
                      <Link
                        href={`/admin/users/${rev.buyer_id}`}
                        style={{
                          color: "var(--ink-2)",
                          textDecoration: "underline",
                          textDecorationColor: "var(--hairline-strong)",
                        }}
                      >
                        {rev.buyer_email ?? "(deleted user)"}
                      </Link>
                    </div>
                    {rev.body && (
                      <p
                        style={{
                          margin: "0 0 6px",
                          fontSize: 14,
                          color: "var(--ink-1)",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {rev.body}
                      </p>
                    )}
                    {(rev.as_described !== null ||
                      rev.easy_communication !== null ||
                      rev.smooth_handover !== null) && (
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 4,
                        }}
                      >
                        {(
                          [
                            ["As described", rev.as_described],
                            ["Easy comms", rev.easy_communication],
                            ["Smooth handover", rev.smooth_handover],
                          ] as const
                        ).map(([label, v]) => {
                          const c = chipState(v);
                          return (
                            <span
                              key={label}
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: c.bg,
                                color: c.fg,
                              }}
                            >
                              {label}: {c.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
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

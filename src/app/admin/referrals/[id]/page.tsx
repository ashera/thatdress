import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { listReferredUsers } from "@/lib/referral";
import { loadSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrer detail — Admin" };

type ReferrerRow = {
  id: string;
  email: string;
  referral_code: string | null;
  created_at: string;
  is_admin: boolean;
  suspended_at: string | null;
};

async function fetchReferrer(id: string): Promise<ReferrerRow | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<ReferrerRow>(
      `SELECT id::text,
              email,
              referral_code,
              created_at::text,
              is_admin,
              suspended_at::text
         FROM users
        WHERE id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
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

export default async function AdminReferrerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const referrer = await fetchReferrer(id);
  if (!referrer) notFound();

  const [referred, settings] = await Promise.all([
    listReferredUsers(referrer.id),
    loadSiteSettings(),
  ]);
  const commissionCents = settings.referralCommissionCents;

  const verifiedListings = referred.reduce(
    (sum, r) => sum + r.verified_listing_count,
    0,
  );
  const friendsWhoListed = referred.filter(
    (r) => r.verified_listing_count > 0,
  ).length;
  const earnedCents = verifiedListings * commissionCents;

  return (
    <div className="page admin-page" style={{ maxWidth: 1024 }}>
      <Link href="/admin/referrals" className="back-link">
        ← Referrals
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Referrals · Referrer</p>
        <h1 style={{ marginBottom: 4 }}>{referrer.email}</h1>
        <p
          className="sub"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.08em",
              color: "var(--ink-3)",
            }}
          >
            CODE: {referrer.referral_code ?? "—"}
          </span>
          <span style={{ color: "var(--ink-4)" }}>
            Joined {formatDate(referrer.created_at)}
          </span>
          {referrer.is_admin && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--surface-sunken)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              Admin
            </span>
          )}
          {referrer.suspended_at && (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                background: "#fee2e2",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#991b1b",
              }}
            >
              Suspended
            </span>
          )}
        </p>
      </header>

      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: "var(--s-5)",
          flexWrap: "wrap",
        }}
      >
        <SummaryTile value={referred.length} label="Referrals" />
        <SummaryTile
          value={friendsWhoListed}
          label="Listed Verified"
          hint={
            referred.length > 0 && friendsWhoListed < referred.length
              ? `${referred.length - friendsWhoListed} not yet`
              : undefined
          }
        />
        <SummaryTile
          value={verifiedListings}
          label="Verified listings"
          hint="Payout multiplier"
        />
        <SummaryTile
          value={priceLabel(earnedCents)}
          label="Outstanding commission"
          hint={
            commissionCents > 0
              ? `${priceLabel(commissionCents)} per Verified listing`
              : "Commission rate is currently $0"
          }
        />
      </div>

      {referred.length === 0 ? (
        <div className="empty-state">
          <h3>No referrals yet</h3>
          <p style={{ margin: 0 }}>
            This user has a referral code but nobody has signed up via
            their link yet.
          </p>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--hairline)",
            borderRadius: 12,
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
                <th style={thStyle("auto", "left")}>Referred user</th>
                <th style={thStyle("130px", "left")}>Joined</th>
                <th style={thStyle("90px", "right")}>Listings</th>
                <th style={thStyle("90px", "right")}>Verified</th>
                <th style={thStyle("110px", "right")}>Earned</th>
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
                    <td style={tdStyle}>
                      <Link
                        href={`/admin/listings?seller_id=${r.id}`}
                        title="See this seller's listings"
                        style={{
                          fontWeight: 600,
                          color: "var(--ink-1)",
                          textDecoration: "underline",
                          textDecorationColor: "var(--hairline-strong)",
                          textUnderlineOffset: 3,
                        }}
                      >
                        {r.email}
                      </Link>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: 12,
                        color: "var(--ink-3)",
                      }}
                    >
                      {formatDate(r.signed_up_at)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.listing_count}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
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
                        ...tdStyle,
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
      )}
    </div>
  );
}

function thStyle(
  width: string,
  align: "left" | "right" | "center" = "center",
): React.CSSProperties {
  return {
    width,
    padding: "10px 12px",
    textAlign: align,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--ink-3)",
  };
}

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

function SummaryTile({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 180px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          color: "var(--ink-1)",
          letterSpacing: "-0.01em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

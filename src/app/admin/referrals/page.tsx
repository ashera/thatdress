import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals — Admin" };

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

type Row = {
  referrer_id: string;
  referrer_email: string;
  referral_code: string | null;
  referred_total: string;
  referred_with_verified: string;
  latest_referral_at: string | null;
};

async function fetchReferrers(): Promise<Row[]> {
  try {
    const r = await query<Row>(
      `SELECT u.id::text                                                    AS referrer_id,
              u.email                                                       AS referrer_email,
              u.referral_code,
              COUNT(r.id)::text                                             AS referred_total,
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM listings l
                    WHERE l.seller_id = r.id
                      AND l.trust_status = 'verified'
                      AND l.is_draft = FALSE
                )
              )::text                                                       AS referred_with_verified,
              MAX(COALESCE(r.referred_at, r.created_at))::text              AS latest_referral_at
         FROM users u
         JOIN users r ON r.referred_by_user_id = u.id
        GROUP BY u.id, u.email, u.referral_code
        ORDER BY COUNT(r.id) DESC, MAX(COALESCE(r.referred_at, r.created_at)) DESC
        LIMIT 200`,
    );
    return r.rows;
  } catch {
    return [];
  }
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

export default async function AdminReferralsPage() {
  await requireAdmin();
  const [rows, settings] = await Promise.all([
    fetchReferrers(),
    loadSiteSettings(),
  ]);
  const commissionCents = settings.referralCommissionCents;

  const totals = rows.reduce(
    (acc, r) => {
      acc.referred += Number(r.referred_total);
      acc.verified += Number(r.referred_with_verified);
      return acc;
    },
    { referred: 0, verified: 0 },
  );
  const totalEarnedCents = totals.verified * commissionCents;

  return (
    <div className="page admin-page" style={{ maxWidth: 1024 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Referrals</p>
        <h1>Referrals</h1>
        <p className="sub">
          Active referrers ranked by total people referred. The
          &lsquo;Verified&rsquo; column shows how many of those people
          have at least one Verified listing — that&rsquo;s the
          reward-trigger condition.
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
        <SummaryTile
          value={rows.length}
          label="Active referrers"
        />
        <SummaryTile value={totals.referred} label="Total referrals" />
        <SummaryTile
          value={totals.verified}
          label="Reward-eligible referrals"
          hint="Referred users with ≥1 Verified listing"
        />
        <SummaryTile
          value={priceLabel(totalEarnedCents)}
          label="Outstanding commission"
          hint={
            commissionCents > 0
              ? `${priceLabel(commissionCents)} per Verified referral · `
              : "Commission rate is currently $0 — "
          }
        />
      </div>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-3)",
          margin: "0 0 var(--s-5)",
          lineHeight: 1.5,
        }}
      >
        Commission rate is{" "}
        <strong>{priceLabel(commissionCents)}</strong> per Verified-listing
        referral. Adjust on{" "}
        <Link
          href="/admin/site-settings"
          style={{
            color: "var(--ink-1)",
            textDecoration: "underline",
            textDecorationColor: "var(--hairline-strong)",
            textUnderlineOffset: 3,
          }}
        >
          /admin/site-settings
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No referrals yet</h3>
          <p style={{ margin: 0 }}>
            Once anyone signs up via someone else&rsquo;s
            <code> ?ref=CODE</code> link, they&rsquo;ll show up here.
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
                  Referrer
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
                  }}
                >
                  Code
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
                  }}
                >
                  Referred
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
                  }}
                >
                  Earned
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
                  }}
                >
                  Latest
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.referrer_id}
                  style={{
                    borderBottom:
                      i === rows.length - 1
                        ? "none"
                        : "1px solid var(--hairline)",
                  }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--ink-1)",
                      }}
                    >
                      {row.referrer_email}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--ink-2)",
                    }}
                  >
                    {row.referral_code ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {row.referred_total}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color:
                        Number(row.referred_with_verified) > 0
                          ? "#92400e"
                          : "var(--ink-4)",
                    }}
                  >
                    {row.referred_with_verified}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color:
                        Number(row.referred_with_verified) > 0 &&
                        commissionCents > 0
                          ? "var(--ink-1)"
                          : "var(--ink-4)",
                    }}
                  >
                    {priceLabel(
                      Number(row.referred_with_verified) * commissionCents,
                    )}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: 12,
                      color: "var(--ink-3)",
                    }}
                  >
                    {formatDate(row.latest_referral_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

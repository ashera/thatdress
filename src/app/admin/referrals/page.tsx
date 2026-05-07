import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSiteSettings } from "@/lib/site-settings";
import { setUserReferrer } from "@/lib/actions/referrals";
import { Button, Field, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals — Admin" };

const ATTRIBUTION_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Attribution saved." },
  cleared: { ok: true, text: "Attribution cleared." },
  "missing-user": { ok: false, text: "User email is required." },
  "user-not-found": {
    ok: false,
    text: "No user with that email — check the spelling.",
  },
  "referrer-not-found": {
    ok: false,
    text: "No referrer matches that email or code.",
  },
  "self-referral": {
    ok: false,
    text: "A user can't refer themselves.",
  },
};

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
  /** Total Verified listings across every referred user — what
   *  the per-listing commission multiplies against. */
  verified_listings: string;
  latest_referral_at: string | null;
};

async function fetchReferrers(): Promise<Row[]> {
  try {
    const r = await query<Row>(
      `SELECT u.id::text                                                  AS referrer_id,
              u.email                                                     AS referrer_email,
              u.referral_code,
              COUNT(r.id)::text                                           AS referred_total,
              COALESCE(SUM(
                (SELECT COUNT(*) FROM listings l
                   WHERE l.seller_id = r.id
                     AND l.trust_status = 'verified'
                     AND l.is_draft = FALSE)
              ), 0)::text                                                 AS verified_listings,
              MAX(COALESCE(r.referred_at, r.created_at))::text            AS latest_referral_at
         FROM users u
         JOIN users r ON r.referred_by_user_id = u.id
        GROUP BY u.id, u.email, u.referral_code
        ORDER BY verified_listings DESC,
                 COUNT(r.id) DESC,
                 MAX(COALESCE(r.referred_at, r.created_at)) DESC
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

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ attributed?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const attributionMessage = sp.attributed
    ? ATTRIBUTION_MESSAGES[sp.attributed] ?? null
    : null;
  const [rows, settings] = await Promise.all([
    fetchReferrers(),
    loadSiteSettings(),
  ]);
  const commissionCents = settings.referralCommissionCents;

  const totals = rows.reduce(
    (acc, r) => {
      acc.referred += Number(r.referred_total);
      acc.verifiedListings += Number(r.verified_listings);
      return acc;
    },
    { referred: 0, verifiedListings: 0 },
  );
  const totalEarnedCents = totals.verifiedListings * commissionCents;

  return (
    <div className="page admin-page" style={{ maxWidth: 1024 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Referrals</p>
        <h1>Referrals</h1>
        <p className="sub">
          Active referrers ranked by total Verified listings their
          referrals have posted — the per-listing payout multiplier.
          One commission is owed for <em>every</em> Verified listing,
          so a referred seller listing five Verified dresses earns
          five commissions for the referrer.
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
          value={totals.verifiedListings}
          label="Verified listings"
          hint="Across all referred users — payout multiplier"
        />
        <SummaryTile
          value={priceLabel(totalEarnedCents)}
          label="Outstanding commission"
          hint={
            commissionCents > 0
              ? `${priceLabel(commissionCents)} per Verified listing`
              : "Commission rate is currently $0"
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
        <strong>{priceLabel(commissionCents)}</strong> per Verified
        listing. Adjust on{" "}
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
                  className="admin-listings-row"
                  style={{
                    borderBottom:
                      i === rows.length - 1
                        ? "none"
                        : "1px solid var(--hairline)",
                  }}
                >
                  <td style={{ padding: "10px 12px" }}>
                    <Link
                      href={`/admin/referrals/${row.referrer_id}`}
                      style={{
                        fontWeight: 600,
                        color: "var(--ink-1)",
                        textDecoration: "underline",
                        textDecorationColor: "var(--hairline-strong)",
                        textUnderlineOffset: 3,
                      }}
                    >
                      {row.referrer_email}
                    </Link>
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
                        Number(row.verified_listings) > 0
                          ? "#92400e"
                          : "var(--ink-4)",
                    }}
                  >
                    {row.verified_listings}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                      color:
                        Number(row.verified_listings) > 0 &&
                        commissionCents > 0
                          ? "var(--ink-1)"
                          : "var(--ink-4)",
                    }}
                  >
                    {priceLabel(
                      Number(row.verified_listings) * commissionCents,
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

      <section
        className="form-card"
        style={{ marginTop: "var(--s-7)" }}
      >
        <h2 className="card-heading">Manually attribute a referral</h2>
        <p className="card-sub">
          Use this if a user signed up before clicking the right
          referral link, or to fix any signup that came through during
          the regex bug that dropped referrals with codes containing
          0/1. Pass either an email or a referral code in the second
          field — whichever you have. Leave the second field blank to
          clear the existing attribution.
        </p>

        {attributionMessage && (
          <p
            className={
              attributionMessage.ok ? "form-success" : "form-error"
            }
            style={{ margin: "var(--s-3) 0 var(--s-4)" }}
          >
            {attributionMessage.text}
          </p>
        )}

        <form
          action={setUserReferrer}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-3)",
          }}
        >
          <Field
            label="User to attribute"
            htmlFor="user_email"
            help="The email of the new user who was referred."
          >
            <Input
              id="user_email"
              name="user_email"
              type="email"
              required
              maxLength={120}
              placeholder="user@example.com"
            />
          </Field>
          <Field
            label="Referrer (email or code)"
            htmlFor="referrer_lookup"
            help="Whichever you have — either the referrer's email or their 8-char referral code. Leave blank to clear an existing attribution."
          >
            <Input
              id="referrer_lookup"
              name="referrer_lookup"
              type="text"
              maxLength={120}
              placeholder="alex@example.com  or  ABC12345"
            />
          </Field>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button type="submit" variant="primary" iconRight="check">
              Apply
            </Button>
          </div>
        </form>
      </section>
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

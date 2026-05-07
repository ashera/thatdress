import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBaseUrl } from "@/lib/email";
import {
  ensureReferralCode,
  listReferredUsers,
} from "@/lib/referral";
import { loadSiteSettings } from "@/lib/site-settings";
import { ReferralLinkCopier } from "./_referral-link-copier";

function priceLabel(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Refer friends — frockd",
  description:
    "Earn rewards by inviting friends to list their pre-loved formal dresses on frockd.",
};

function formatDate(s: string): string {
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

function maskEmail(email: string): string {
  // First two chars of local-part + ●●● + domain. Keeps reporting useful
  // ('al●●●@gmail.com') without exposing the full email of someone the
  // referrer probably already knows but who hasn't asked to be public.
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"●".repeat(Math.max(2, local.length - 2))}${domain}`;
}

export default async function ReferPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile/refer");

  // Backfill the referral code lazily on first visit — accounts older
  // than the column may not have one yet (the schema backfill SQL
  // covers most, but this is the belt to that braces).
  const code = await ensureReferralCode(user.id);
  const baseUrl = await getBaseUrl();
  const referralUrl = code ? `${baseUrl}/?ref=${code}` : null;
  const [referred, settings] = await Promise.all([
    listReferredUsers(user.id),
    loadSiteSettings(),
  ]);
  const verifiedListings = referred.reduce(
    (sum, r) => sum + r.verified_listing_count,
    0,
  );
  const friendsWhoListed = referred.filter(
    (r) => r.verified_listing_count > 0,
  ).length;
  const commissionCents = settings.referralCommissionCents;
  const earnedCents = commissionCents * verifiedListings;

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/profile" className="back-link">
          ← Back to profile
        </Link>

        <header style={{ margin: "0 0 var(--s-7)" }}>
          <p className="eyebrow" style={{ margin: 0, color: "var(--ink-3)" }}>
            Refer a seller
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            Got a friend with great dresses sitting in the back of a
            wardrobe?
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              maxWidth: "60ch",
              lineHeight: 1.55,
            }}
          >
            Send them your link. You earn a commission for{" "}
            <strong>every Verified listing</strong> they post — five
            dresses, five commissions. Frockd&rsquo;s inventory grows,
            your friend&rsquo;s wardrobe shrinks, and you get something
            for the introduction.
          </p>
        </header>

        {referralUrl ? (
          <section
            style={{
              padding: "var(--s-6)",
              background: "var(--surface)",
              border: "1px solid var(--hairline)",
              borderRadius: 14,
              marginBottom: "var(--s-5)",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: "0 0 var(--s-2)",
              }}
            >
              Your referral link
            </p>
            <ReferralLinkCopier url={referralUrl} code={code!} />
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                margin: "var(--s-3) 0 0",
                lineHeight: 1.5,
              }}
            >
              Anyone who arrives via this link and signs up gets
              attributed to you for 30 days, no matter how many other
              frockd pages they bounce through first.
            </p>
          </section>
        ) : (
          <div className="form-error">
            We couldn&rsquo;t generate your referral code. Try
            refreshing — if it keeps happening, let support know.
          </div>
        )}

        <section
          style={{
            padding: "var(--s-6)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 14,
            marginBottom: "var(--s-5)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink-1)",
              margin: "0 0 var(--s-3)",
              letterSpacing: "-0.01em",
            }}
          >
            Your referrals so far
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "var(--s-3)",
              marginBottom: referred.length > 0 ? "var(--s-5)" : 0,
            }}
          >
            <StatTile
              value={referred.length}
              label="Friends signed up"
              hint={
                friendsWhoListed > 0
                  ? `${friendsWhoListed} listing Verified dresses`
                  : undefined
              }
            />
            <StatTile
              value={verifiedListings}
              label="Verified listings"
              hint="Total dresses listed by your referrals"
            />
            <StatTile
              value={priceLabel(earnedCents)}
              label="Earned to date"
              hint={
                commissionCents > 0
                  ? `${priceLabel(commissionCents)} per Verified listing`
                  : "Commission rate not yet set"
              }
            />
          </div>

          {referred.length === 0 ? (
            <p
              style={{
                color: "var(--ink-3)",
                fontSize: 14,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              No referrals yet. Send your link to a friend who&rsquo;s
              been meaning to clear out their wardrobe — new bridesmaid
              dresses, gala leftovers, the lot.
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-2)",
              }}
            >
              {referred.map((r) => (
                <li
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--s-3)",
                    padding: "10px 12px",
                    background: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: "var(--ink-1)",
                      }}
                    >
                      {maskEmail(r.email)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--ink-3)",
                        marginTop: 2,
                      }}
                    >
                      Joined {formatDate(r.signed_up_at)} ·{" "}
                      {r.listing_count}{" "}
                      {r.listing_count === 1 ? "listing" : "listings"}
                    </div>
                  </div>
                  {r.verified_listing_count > 0 ? (
                    <div
                      style={{
                        flex: "0 0 auto",
                        textAlign: "right",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        alignItems: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#fef3c7",
                          color: "#92400e",
                          border: "1px solid #fcd34d",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✓ {r.verified_listing_count} Verified
                      </span>
                      {commissionCents > 0 && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--ink-2)",
                            fontWeight: 600,
                          }}
                        >
                          +
                          {priceLabel(
                            commissionCents * r.verified_listing_count,
                          )}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      style={{
                        flex: "0 0 auto",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--ink-3)",
                      }}
                    >
                      Not yet
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p
          style={{
            color: "var(--ink-3)",
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: "center",
            margin: 0,
          }}
        >
          {commissionCents > 0 ? (
            <>
              Earnings update automatically as your referrals post
              Verified listings. Payouts are settled out-of-band — the
              frockd team will be in touch when you&rsquo;re due.
            </>
          ) : (
            <>
              The commission rate hasn&rsquo;t been published yet. Keep
              referring — your earnings will backfill the moment a rate
              is set.
            </>
          )}
        </p>
      </main>
    </div>
  );
}

function StatTile({
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
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
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
        }}
      >
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{hint}</div>
      )}
    </div>
  );
}

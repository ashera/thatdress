import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";
import { ensureReferralCode } from "@/lib/referral";
import { ReferralLinkCopier } from "../../../profile/refer/_referral-link-copier";

export const dynamic = "force-dynamic";
export const metadata = { title: "First listing published — frockd" };

type Row = {
  title: string;
  seller_id: string;
  is_draft: boolean;
  is_published: boolean;
  total_listed: string;
};

/**
 * First-publish moment for a new seller. publishDraftListing
 * redirects here when the seller's count of non-draft listings
 * crosses from 0 to 1 — the highest-conviction moment to ask
 * 'got friends who'd also list here?'. Direct-URL guesses
 * bounce away (must own the listing, must actually be the
 * seller's only non-draft listing).
 */
export default async function FirstPublishThanksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!/^\d+$/.test(id)) notFound();

  const r = await query<Row>(
    `SELECT l.title,
            l.seller_id::text AS seller_id,
            l.is_draft,
            l.is_published,
            (SELECT COUNT(*)::text FROM listings
                WHERE seller_id = l.seller_id
                  AND is_draft = FALSE) AS total_listed
       FROM listings l
      WHERE l.id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) notFound();
  if (row.seller_id !== user.id && !user.isAdmin) {
    redirect(`/listings/${id}`);
  }
  // Bounce if this isn't actually a 'first publish' anymore
  // (e.g. seller visited the URL via history after already
  // publishing more listings).
  const total = Number(row.total_listed ?? 0);
  if (row.is_draft || !row.is_published || total !== 1) {
    redirect(`/listings/${id}`);
  }

  const code = await ensureReferralCode(user.id);
  const baseUrl = getShareBaseUrl();
  const referralUrl = code ? `${baseUrl}/r/${code}` : null;

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 640, margin: "0 auto" }}>
        <header
          style={{
            textAlign: "center",
            marginBottom: "var(--s-6)",
          }}
        >
          <div
            style={{
              fontSize: 56,
              lineHeight: 1,
              marginBottom: "var(--s-3)",
            }}
            aria-hidden
          >
            🎀
          </div>
          <p className="eyebrow" style={{ margin: "0 0 var(--s-2)" }}>
            You're live
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "0 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Your first listing is up.
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            <strong>{row.title}</strong> is now in front of every buyer
            in your region. Now the fun part…
          </p>
        </header>

        <section
          style={{
            padding: "var(--s-6)",
            background: "var(--volt-50, #fef9c3)",
            border: "1px solid var(--volt-200, #fde68a)",
            borderRadius: 14,
            marginBottom: "var(--s-5)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              color: "var(--ink-1)",
              margin: "0 0 var(--s-2)",
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
            }}
          >
            Who else has dresses going unworn?
          </h2>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              margin: "0 0 var(--s-4)",
              lineHeight: 1.55,
            }}
          >
            Frockd grows when more people list. Send your invite link
            to one friend — you earn a commission for every Verified
            listing they post.
          </p>
          {referralUrl && code ? (
            <ReferralLinkCopier url={referralUrl} code={code} />
          ) : (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                margin: 0,
              }}
            >
              We&rsquo;ll set up your invite link in a moment — find it on{" "}
              <Link
                href="/profile/refer"
                style={{
                  color: "var(--ink-1)",
                  textDecoration: "underline",
                }}
              >
                /profile/refer
              </Link>
              .
            </p>
          )}
        </section>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "var(--s-4)",
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/listings/${id}`}
            style={{
              color: "var(--ink-2)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
              fontSize: 14,
            }}
          >
            View my listing
          </Link>
          <span aria-hidden style={{ color: "var(--ink-4)" }}>
            ·
          </span>
          <Link
            href="/listings/mine"
            style={{
              color: "var(--ink-2)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
              fontSize: 14,
            }}
          >
            My listings
          </Link>
        </div>
      </main>
    </div>
  );
}

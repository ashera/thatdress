import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getShareBaseUrl } from "@/lib/email";
import { ensureReferralCode } from "@/lib/referral";
import { ReferralLinkCopier } from "../../../profile/refer/_referral-link-copier";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sold — frockd" };

type Row = {
  title: string;
  seller_id: string;
  sold_at: string | null;
  sold_to_user_id: string | null;
};

/**
 * Peak-engagement moment for a seller: their listing just closed.
 * closeListingWithBuyer redirects here, we render a celebration
 * card and prompt them to invite a friend before they leave the
 * flow. Single biggest dopamine point on the platform; pre-Round-3
 * this hand-off went silently back to /listings/mine.
 */
export default async function SoldThanksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!/^\d+$/.test(id)) notFound();

  const r = await query<Row>(
    `SELECT title,
            seller_id::text,
            sold_at::text,
            sold_to_user_id::text
       FROM listings
      WHERE id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const row = r.rows[0];
  if (!row) notFound();
  // Only the seller (or an admin) should land here — anyone else
  // is following a guessed URL. Bounce them to the public detail.
  if (row.seller_id !== user.id && !user.isAdmin) {
    redirect(`/listings/${id}`);
  }
  // No celebration if the listing isn't actually marked sold. Could
  // happen if a seller bookmarks this URL and revisits later.
  if (!row.sold_at) redirect(`/listings/${id}/edit`);

  const code = await ensureReferralCode(user.id);
  const baseUrl = getShareBaseUrl();
  const referralUrl = code ? `${baseUrl}/r/${code}` : null;

  const attributedToBuyer = !!row.sold_to_user_id;

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
            🎉
          </div>
          <p className="eyebrow" style={{ margin: "0 0 var(--s-2)" }}>
            Sale closed
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
            You sold {row.title}.
          </h1>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: "var(--t-body-l)",
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {attributedToBuyer
              ? "The buyer will get a review prompt by email so other shoppers know you delivered. While you're here…"
              : "Marked sold and out of public browse. While you're here…"}
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
            Got friends with dresses gathering dust?
          </h2>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: 15,
              margin: "0 0 var(--s-4)",
              lineHeight: 1.55,
            }}
          >
            You just proved this works. Pass your link to a friend and
            you earn a commission for every Verified listing they post.
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
              We couldn&rsquo;t generate your referral code right now —
              head to{" "}
              <Link
                href="/profile/refer"
                style={{ color: "var(--ink-1)", textDecoration: "underline" }}
              >
                /profile/refer
              </Link>{" "}
              to grab it.
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
            href="/listings/mine"
            style={{
              color: "var(--ink-2)",
              textDecoration: "underline",
              textDecorationColor: "var(--hairline-strong)",
              textUnderlineOffset: 3,
              fontSize: 14,
            }}
          >
            Back to my listings
          </Link>
          <span aria-hidden style={{ color: "var(--ink-4)" }}>
            ·
          </span>
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
            View this listing
          </Link>
        </div>
      </main>
    </div>
  );
}

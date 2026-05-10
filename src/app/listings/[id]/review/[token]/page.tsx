import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { lookupReviewToken } from "@/lib/reviews";
import { submitListingReview } from "@/lib/actions/reviews";
import { Button } from "../../../../_components/ui";
import { StarRatingInput } from "./_star-rating-input";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leave a review — frockd" };

const ERRORS: Record<string, string> = {
  "invalid-stars": "Pick a star rating before submitting.",
  locked:
    "This review is locked — reviews can only be edited within 7 days of the original submission.",
};

type ListingRow = {
  title: string;
  seller_name: string | null;
  seller_email: string | null;
  primary_image_id: string | null;
  designer_name: string | null;
};

async function fetchListing(id: string): Promise<ListingRow | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const r = await query<ListingRow>(
      `SELECT l.title,
              CONCAT_WS(' ', u.first_name, u.surname) AS seller_name,
              u.email                                  AS seller_email,
              d.name                                   AS designer_name,
              (SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1) AS primary_image_id
         FROM listings l
         LEFT JOIN users     u ON u.id = l.seller_id
         LEFT JOIN designers d ON d.id = l.designer_id
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return r.rows[0] ?? null;
  } catch {
    return null;
  }
}

function sellerLabel(row: ListingRow): string {
  const name = row.seller_name?.trim();
  if (name) return name;
  const local = row.seller_email?.split("@")[0];
  return local ?? "the seller";
}

export default async function ReviewListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, token } = await params;
  const sp = await searchParams;
  const errorMessage = sp.error ? ERRORS[sp.error] ?? null : null;

  // Resolve token first so we can show a meaningful 'expired/used'
  // message rather than 404'ing.
  const lookup = await lookupReviewToken(token);
  if (!lookup.ok) {
    return (
      <div className="page page--pad">
        <main style={{ maxWidth: 520, margin: "0 auto" }}>
          <p className="eyebrow">Review link</p>
          <h1 style={{ marginBottom: 8 }}>This link is no longer valid</h1>
          <p style={{ color: "var(--ink-3)" }}>
            {lookup.reason === "used"
              ? "Looks like a review has already been submitted from this link."
              : lookup.reason === "expired"
                ? "Review links expire after 60 days — sorry, we can't accept this one."
                : "We couldn't find a review prompt matching that link."}
          </p>
          <p style={{ marginTop: 24 }}>
            <Link href="/listings" className="back-link">
              ← Back to browse
            </Link>
          </p>
        </main>
      </div>
    );
  }
  if (lookup.listingId !== id) redirect(`/listings/${lookup.listingId}/review/${token}`);

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/listings/${id}/review/${token}`)}`,
    );
  }
  if (user.id !== lookup.buyerId) {
    return (
      <div className="page page--pad">
        <main style={{ maxWidth: 520, margin: "0 auto" }}>
          <p className="eyebrow">Review link</p>
          <h1 style={{ marginBottom: 8 }}>Wrong account</h1>
          <p style={{ color: "var(--ink-3)" }}>
            This review link was issued to a different frockd account.
            Sign out and sign in as the buyer to leave the review.
          </p>
          <p style={{ marginTop: 24 }}>
            <Link href="/listings" className="back-link">
              ← Back to browse
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const listing = await fetchListing(id);
  if (!listing) redirect("/listings");

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link href={`/listings/${id}`} className="back-link">
          ← Back to listing
        </Link>

        <header style={{ margin: "0 0 var(--s-6)" }}>
          <p className="eyebrow">Review your purchase</p>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-h1)",
              color: "var(--ink-1)",
              margin: "var(--s-2) 0 var(--s-3)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            How did your {listing.title} purchase go?
          </h1>
          <p style={{ color: "var(--ink-3)", margin: 0 }}>
            Your review will appear on{" "}
            <strong>{sellerLabel(listing)}</strong>&rsquo;s public
            seller profile. Honest reviews — good or bad — help future
            buyers decide.
          </p>
        </header>

        <div
          style={{
            display: "flex",
            gap: "var(--s-4)",
            alignItems: "center",
            marginBottom: "var(--s-5)",
            padding: "var(--s-4)",
            background: "var(--surface-sunken)",
            border: "1px solid var(--hairline)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 56,
              aspectRatio: "3 / 4",
              flex: "0 0 auto",
              borderRadius: 6,
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            {listing.primary_image_id && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/listings/${id}/images/${listing.primary_image_id}?w=200`}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              {listing.designer_name ?? "Designer unknown"}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {listing.title}
            </div>
          </div>
        </div>

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
            {errorMessage}
          </p>
        )}

        <form
          action={submitListingReview}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-5)",
          }}
        >
          <input type="hidden" name="listingId" value={id} />
          <input type="hidden" name="token" value={token} />

          <div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: "0 0 8px",
              }}
            >
              Star rating
            </p>
            <StarRatingInput />
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                margin: "8px 0 0",
              }}
            >
              5 = perfect · 1 = avoid
            </p>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                marginBottom: 8,
              }}
            >
              Quick checks (optional)
            </legend>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <ChipRow
                name="as_described"
                label="Was the dress as described?"
              />
              <ChipRow
                name="easy_communication"
                label="Was the seller easy to communicate with?"
              />
              <ChipRow
                name="smooth_handover"
                label="Did the handover go smoothly?"
              />
            </div>
          </fieldset>

          <label>
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                marginBottom: 6,
              }}
            >
              Comment (optional)
            </span>
            <textarea
              name="body"
              maxLength={500}
              rows={4}
              placeholder="What stood out? Anything other buyers should know?"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--hairline)",
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.5,
                color: "var(--ink-1)",
                background: "var(--surface)",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-4)",
                marginTop: 4,
                textAlign: "right",
              }}
            >
              500 characters max
            </div>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="primary" size="lg">
              Submit review
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function ChipRow({ name, label }: { name: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 10px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 8,
      }}
    >
      <span style={{ flex: "1 1 240px", fontSize: 14 }}>{label}</span>
      <div style={{ display: "flex", gap: 6 }}>
        {(["yes", "no"] as const).map((v) => (
          <label
            key={v}
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              border: "1px solid var(--hairline-strong)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-2)",
              background: "var(--surface)",
            }}
          >
            <input
              type="radio"
              name={name}
              value={v}
              style={{ marginRight: 4 }}
            />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </div>
  );
}

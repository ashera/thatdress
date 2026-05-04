import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { makeOffer } from "@/lib/actions/offers";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-amount":
    "Enter a valid offer in dollars (e.g. 1500 or 1499.99).",
};

type ListingHead = {
  id: string;
  title: string;
  price_cents: number;
  seller_id: string | null;
  offers_enabled: boolean;
};

export default async function MakeOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  if (!/^\d+$/.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/listings/${id}/offer`);

  const r = await query<ListingHead>(
    `SELECT id::text, title, price_cents, seller_id::text, offers_enabled
       FROM listings WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const listing = r.rows[0];
  if (!listing) notFound();
  if (!listing.offers_enabled) redirect(`/listings/${id}`);
  if (listing.seller_id === user.id) redirect(`/listings/${id}`);

  const askingPrice = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(listing.price_cents / 100);

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 520, margin: "0 auto" }}>
        <Link href={`/listings/${id}`} className="back-link">
          ← Back to listing
        </Link>

        <p className="eyebrow">Make an offer</p>
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
          {listing.title}
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-7)" }}>
          Asking price: <strong>{askingPrice}</strong>. The seller will be
          notified via direct message.
        </p>

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}

        <section className="form-card">
          <form
            action={makeOffer}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <input type="hidden" name="listingId" value={id} />

            <Field
              label="Your offer (AUD)"
              htmlFor="amount"
              help="The seller can accept, decline, or counter."
            >
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                pattern="^\d+(\.\d{1,2})?$"
                required
                placeholder="e.g. 1500"
              />
            </Field>

            <Field
              label="Note to seller (optional)"
              htmlFor="note"
              help="Reason for your offer, pickup timing, etc."
            >
              <Textarea
                id="note"
                name="note"
                rows={4}
                maxLength={500}
                placeholder="I can pick up this weekend and pay cash…"
              />
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Send offer
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

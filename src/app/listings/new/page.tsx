import { redirect } from "next/navigation";
import { createListing } from "@/lib/actions/listings";
import { getCurrentUser } from "@/lib/auth";
import { loadListingRefOptions } from "@/lib/ref-data";
import { ListingForm } from "../../_components/listing-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required (200 characters or fewer).",
  "long-description": "Description must be 5,000 characters or fewer.",
  "invalid-price": "Enter a valid price in dollars (e.g. 1899 or 1899.00).",
  "invalid-make": "Pick a make.",
  "invalid-model": "Model is required.",
  "invalid-year": "Year must be between 2000 and next year.",
  "invalid-condition": "Pick a condition.",
  "invalid-class": "Pick a bike class.",
  "invalid-category": "Pick a bike category.",
  "invalid-location": "A postal code or location is required.",
  "out-of-range": "One of the numeric values is outside the allowed range.",
  "too-many": "You can attach up to 10 photos.",
  "too-large": "Each photo must be 5 MB or smaller.",
  "bad-type": "Photos must be JPEG, PNG, or WebP.",
};

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const refs = await loadListingRefOptions();

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 720, margin: "0 auto" }}>
        <p className="eyebrow">Sell your eBike</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1)",
            color: "var(--ink-1)",
            margin: "0 0 var(--s-3)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          New listing
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-7)" }}>
          Tell future riders what you&rsquo;re selling.
        </p>

        <ListingForm
          action={createListing}
          refs={refs}
          submitLabel="Publish listing"
          errorMessage={errorMessage}
          showPhotos
        />
      </main>
    </div>
  );
}

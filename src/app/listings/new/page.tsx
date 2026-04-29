import { redirect } from "next/navigation";
import { createListing } from "@/lib/actions/listings";
import { getCurrentUser } from "@/lib/auth";
import {
  Button,
  ButtonLink,
  Field,
  Input,
  Textarea,
} from "../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required (200 characters or fewer).",
  "long-description": "Description must be 5,000 characters or fewer.",
  "invalid-price": "Enter a valid price in dollars (e.g. 1899 or 1899.00).",
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
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div className="page" style={{ padding: "var(--s-9) var(--s-7)" }}>
      <main style={{ maxWidth: 640, margin: "0 auto" }}>
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

        <div className="form-card">
          <form
            action={createListing}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-5)",
            }}
          >
            <Field label="Title" htmlFor="title">
              <Input
                id="title"
                type="text"
                name="title"
                required
                maxLength={200}
                placeholder="Specialized Turbo Vado 4.0"
              />
            </Field>

            <Field label="Price (USD)" htmlFor="price">
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                name="price"
                required
                placeholder="1899.00"
                pattern="^\d+(\.\d{1,2})?$"
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                name="description"
                rows={5}
                maxLength={5000}
                placeholder="Year, mileage, condition, included accessories…"
              />
            </Field>

            {errorMessage && <p className="form-error">{errorMessage}</p>}

            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                justifyContent: "flex-end",
                marginTop: "var(--s-2)",
              }}
            >
              <ButtonLink href="/listings" variant="ghost">
                Cancel
              </ButtonLink>
              <Button type="submit" variant="primary" iconRight="arrow">
                Publish listing
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

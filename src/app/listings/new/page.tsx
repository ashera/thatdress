import Link from "next/link";
import { redirect } from "next/navigation";
import { createListing } from "@/lib/actions/listings";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-title": "Title is required (200 characters or fewer).",
  "long-description": "Description must be 5,000 characters or fewer.",
  "invalid-price":
    "Enter a valid price in dollars (e.g. 1899 or 1899.00).",
};

const inputClass =
  "rounded-md border border-sand-300 bg-white/80 px-3 py-2 text-sm text-sand-900 outline-none transition-colors placeholder:text-sand-400 focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 dark:border-ocean-800 dark:bg-ocean-900/60 dark:text-sand-50 dark:placeholder:text-sand-500 dark:focus:border-ocean-400 dark:focus:ring-ocean-700/50";

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
    <div className="flex-1 bg-gradient-to-b from-sand-50 to-sand-100 px-6 py-16 dark:from-ocean-950 dark:to-ocean-900">
      <main className="mx-auto w-full max-w-xl">
        <Link
          href="/listings"
          className="text-sm text-sand-600 hover:text-ocean-700 dark:text-sand-300 dark:hover:text-ocean-200"
        >
          ← Listings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-sand-900 dark:text-sand-50">
          New listing
        </h1>
        <p className="mt-1 text-sm text-sand-700 dark:text-sand-300">
          Tell future riders what you&rsquo;re selling.
        </p>

        <form
          action={createListing}
          className="mt-6 flex flex-col gap-4 rounded-2xl border border-sand-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-ocean-800 dark:bg-ocean-900/60"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-sand-800 dark:text-sand-200">
              Title
            </span>
            <input
              type="text"
              name="title"
              required
              maxLength={200}
              placeholder="Specialized Turbo Vado 4.0"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-sand-800 dark:text-sand-200">
              Price (USD)
            </span>
            <input
              type="text"
              inputMode="decimal"
              name="price"
              required
              placeholder="1899.00"
              pattern="^\d+(\.\d{1,2})?$"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-sand-800 dark:text-sand-200">
              Description
            </span>
            <textarea
              name="description"
              rows={5}
              maxLength={5000}
              placeholder="Year, mileage, condition, included accessories…"
              className={inputClass}
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-coral-200 bg-coral-50 px-3 py-2 text-sm text-coral-800 dark:border-coral-700/50 dark:bg-coral-900/30 dark:text-coral-200">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Link
              href="/listings"
              className="rounded-full border border-sand-300 bg-white/70 px-4 py-2 text-sm font-medium text-sand-800 transition-colors hover:bg-white dark:border-ocean-700 dark:bg-ocean-900/60 dark:text-sand-100 dark:hover:bg-ocean-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-full bg-ocean-700 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ocean-800 dark:bg-ocean-500 dark:hover:bg-ocean-400"
            >
              Publish listing
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

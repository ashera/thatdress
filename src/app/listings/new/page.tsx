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
    <div className="bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="mx-auto w-full max-w-xl">
        <Link
          href="/listings"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Listings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          New listing
        </h1>

        <form action={createListing} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Title
            </span>
            <input
              type="text"
              name="title"
              required
              maxLength={200}
              placeholder="Specialized Turbo Vado 4.0"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Price (USD)
            </span>
            <input
              type="text"
              inputMode="decimal"
              name="price"
              required
              placeholder="1899.00"
              pattern="^\d+(\.\d{1,2})?$"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Description
            </span>
            <textarea
              name="description"
              rows={5}
              maxLength={5000}
              placeholder="Year, mileage, condition, included accessories…"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <Link
              href="/listings"
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Publish listing
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

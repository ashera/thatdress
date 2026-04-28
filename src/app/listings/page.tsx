import Link from "next/link";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
  seller_email: string | null;
};

const priceFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

async function fetchListings(): Promise<
  | { ok: true; listings: Listing[] }
  | { ok: false; error: string }
> {
  try {
    const result = await query<Listing>(
      `SELECT l.id::text,
              l.title,
              l.description,
              l.price_cents,
              l.created_at::text,
              u.email AS seller_email
         FROM listings l
         LEFT JOIN users u ON u.id = l.seller_id
         ORDER BY l.created_at DESC
         LIMIT 50`,
    );
    return { ok: true, listings: result.rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export default async function ListingsPage() {
  const [result, user] = await Promise.all([fetchListings(), getCurrentUser()]);

  return (
    <div className="flex-1 bg-gradient-to-b from-sand-50 to-sand-100 px-6 py-16 dark:from-ocean-950 dark:to-ocean-900">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-sand-600 hover:text-ocean-700 dark:text-sand-300 dark:hover:text-ocean-200"
            >
              ← Home
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-sand-900 dark:text-sand-50">
              Listings
            </h1>
          </div>
          {user ? (
            <Link
              href="/listings/new"
              className="rounded-full bg-ocean-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ocean-800 dark:bg-ocean-500 dark:hover:bg-ocean-400"
            >
              + New listing
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-coral-700 underline hover:text-coral-800 dark:text-coral-300 dark:hover:text-coral-200"
            >
              Log in to post
            </Link>
          )}
        </header>

        {!result.ok ? (
          <div className="rounded-2xl border border-coral-200 bg-coral-50 p-6 text-sm text-coral-800 dark:border-coral-700/50 dark:bg-coral-900/30 dark:text-coral-200">
            <p className="font-medium">Could not load listings.</p>
            <p className="mt-1 font-mono">{result.error}</p>
          </div>
        ) : result.listings.length === 0 ? (
          <p className="text-sand-700 dark:text-sand-300">
            No listings yet.{" "}
            {user ? (
              <Link href="/listings/new" className="font-medium text-ocean-700 underline dark:text-ocean-300">
                Be the first to post one.
              </Link>
            ) : (
              <Link href="/register" className="font-medium text-ocean-700 underline dark:text-ocean-300">
                Register
              </Link>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.listings.map((listing) => (
              <li
                key={listing.id}
                className="rounded-2xl border border-sand-200 bg-white/80 p-5 shadow-sm backdrop-blur transition-colors hover:border-ocean-300 dark:border-ocean-800 dark:bg-ocean-900/60 dark:hover:border-ocean-500"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-base font-medium text-sand-900 dark:text-sand-50">
                    {listing.title}
                  </h2>
                  <span className="shrink-0 rounded-full bg-ocean-100 px-2.5 py-0.5 font-mono text-sm font-medium text-ocean-800 dark:bg-ocean-900 dark:text-ocean-200">
                    {priceFmt.format(listing.price_cents / 100)}
                  </span>
                </div>
                {listing.description ? (
                  <p className="mt-1 text-sm text-sand-700 dark:text-sand-300">
                    {listing.description}
                  </p>
                ) : null}
                {listing.seller_email ? (
                  <p className="mt-2 text-xs text-sand-500 dark:text-sand-400">
                    Posted by {listing.seller_email}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

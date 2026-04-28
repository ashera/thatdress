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
    <div className="bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              ← Home
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Listings
            </h1>
          </div>
          {user ? (
            <Link
              href="/listings/new"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              New listing
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
            >
              Log in to post
            </Link>
          )}
        </header>

        {!result.ok ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <p className="font-medium">Could not load listings.</p>
            <p className="mt-1 font-mono">{result.error}</p>
          </div>
        ) : result.listings.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No listings yet.{" "}
            {user ? (
              <Link href="/listings/new" className="font-medium underline">
                Be the first to post one.
              </Link>
            ) : (
              <Link href="/register" className="font-medium underline">
                Register
              </Link>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.listings.map((listing) => (
              <li
                key={listing.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-base font-medium text-zinc-950 dark:text-zinc-50">
                    {listing.title}
                  </h2>
                  <span className="shrink-0 font-mono text-sm text-zinc-700 dark:text-zinc-300">
                    {priceFmt.format(listing.price_cents / 100)}
                  </span>
                </div>
                {listing.description ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {listing.description}
                  </p>
                ) : null}
                {listing.seller_email ? (
                  <p className="mt-2 text-xs text-zinc-500">
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

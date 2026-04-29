import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ButtonLink } from "../_components/ui";
import { ListingCard, listingFromRow } from "../_components/listing-card";

export const dynamic = "force-dynamic";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
  seller_email: string | null;
};

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
  const count = result.ok ? result.listings.length : 0;

  return (
    <div className="page" style={{ padding: "var(--s-9) var(--s-7)" }}>
      <div className="browse-toolbar">
        <div className="left">
          <h3>Browse eBikes</h3>
          {result.ok && (
            <span className="count">
              {count} {count === 1 ? "listing" : "listings"}
            </span>
          )}
        </div>
        <div className="left">
          {user ? (
            <ButtonLink href="/listings/new" variant="primary" size="sm" icon="plus">
              New listing
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="dark" size="sm">
              Log in to post
            </ButtonLink>
          )}
        </div>
      </div>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load listings.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.listings.length === 0 ? (
        <div className="empty-state">
          <h3>No listings yet</h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            {user
              ? "Be the first to post one."
              : "Register to post the first one."}
          </p>
          <ButtonLink
            href={user ? "/listings/new" : "/register"}
            variant="primary"
            iconRight="arrow"
          >
            {user ? "Create listing" : "Register"}
          </ButtonLink>
        </div>
      ) : (
        <div className="results-grid">
          {result.listings.map((row) => (
            <ListingCard
              key={row.id}
              data={listingFromRow(row)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

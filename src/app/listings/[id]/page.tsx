import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { ButtonLink } from "../../_components/ui";

export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
  seller_email: string | null;
};

async function fetchListing(id: string): Promise<
  | { ok: true; listing: ListingRow | null }
  | { ok: false; error: string }
> {
  if (!/^\d+$/.test(id)) return { ok: true, listing: null };
  try {
    const result = await query<ListingRow>(
      `SELECT l.id::text,
              l.title,
              l.description,
              l.price_cents,
              l.created_at::text,
              u.email AS seller_email
         FROM listings l
         LEFT JOIN users u ON u.id = l.seller_id
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    return { ok: true, listing: result.rows[0] ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function initials(email?: string | null): string {
  if (!email) return "??";
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[1][0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function formatPostedDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchListing(id);

  if (!result.ok) {
    return (
      <div className="page detail-page">
        <Link href="/listings" className="back-link">
          ← Back to browse
        </Link>
        <div className="form-error">
          <strong>Could not load listing.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      </div>
    );
  }

  if (!result.listing) notFound();

  const l = result.listing;
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(l.price_cents / 100);
  const sellerName = l.seller_email
    ? (l.seller_email.split("@")[0] ?? l.seller_email)
    : "Unknown seller";

  return (
    <div className="page detail-page">
      <Link href="/listings" className="back-link">
        ← Back to browse
      </Link>

      <article className="detail">
        <div className="detail-photo">
          <span>eBike photo</span>
        </div>

        <div className="detail-body">
          <p className="eyebrow">Used eBike</p>
          <h1 className="detail-title">{l.title}</h1>
          <div className="detail-price">{price}</div>

          <div className="detail-seller">
            <span className="avatar">{initials(l.seller_email)}</span>
            <div>
              <div className="who">{sellerName}</div>
              <div className="when">Posted {formatPostedDate(l.created_at)}</div>
            </div>
          </div>

          {l.description ? (
            <p className="detail-desc">{l.description}</p>
          ) : (
            <p className="detail-desc detail-desc--empty">
              No description provided.
            </p>
          )}

          <div className="detail-actions">
            <ButtonLink
              href={
                l.seller_email
                  ? `mailto:${l.seller_email}?subject=${encodeURIComponent(`Re: ${l.title}`)}`
                  : "/listings"
              }
              variant="primary"
              size="lg"
              iconRight="arrow"
            >
              {l.seller_email ? "Contact seller" : "Back to browse"}
            </ButtonLink>
            <ButtonLink href="/listings" variant="ghost" size="lg">
              See more bikes
            </ButtonLink>
          </div>
        </div>
      </article>
    </div>
  );
}

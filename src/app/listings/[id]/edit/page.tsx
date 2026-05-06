import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Editing now happens through the same wizard as new-listing creation —
// /listings/new/{id}/basics, /photos, /style, /measurements, /condition,
// /publish — so the seller has a single consistent flow with the
// listing-health score and trust badges visible across every step.
// This page just authenticates and redirects.
export const dynamic = "force-dynamic";

export default async function EditListingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Verify the user owns this listing (or is admin) before sending them
  // into the wizard, which has its own ownership check but redirects
  // to /listings/mine on failure.
  const r = await query<{ seller_id: string | null }>(
    `SELECT seller_id::text FROM listings WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  const sellerId = r.rows[0]?.seller_id;
  if (!sellerId) notFound();
  if (sellerId !== user.id && !user.isAdmin) {
    redirect(`/listings/${id}`);
  }

  redirect(`/listings/new/${id}/basics`);
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  addListingImages,
  deleteListingImage,
  moveListingImage,
  setListingVisibility,
  setPrimaryImage,
  updateListing,
} from "@/lib/actions/listings";
import { loadListingRefOptions } from "@/lib/ref-data";
import {
  Button,
  ButtonLink,
  Field,
} from "../../../_components/ui";
import {
  ListingForm,
  type ListingFormDefaults,
} from "../../../_components/listing-form";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "no-files": "Pick at least one photo to upload.",
  "too-many": "Listings can have at most 10 photos.",
  "too-large": "Each photo must be 5 MB or smaller.",
  "bad-type": "Photos must be JPEG, PNG, or WebP.",
  "upload-failed": "We couldn't save those photos — please try again.",
  "long-description": "Description must be 5,000 characters or fewer.",
  "invalid-price": "Enter a valid price in dollars (e.g. 1899 or 1899.00).",
  "invalid-designer": "Pick a designer.",
  "invalid-model": "Style name or model is required.",
  "invalid-year": "Year must be between 1990 and next year.",
  "invalid-condition": "Pick a condition.",
  "invalid-occasion": "Pick an occasion.",
  "invalid-location": "A postal code or location is required.",
  "out-of-range": "One of the numeric values is outside the allowed range.",
};

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  seller_id: string | null;
  is_published: boolean;
  offers_enabled: boolean;
  region_id: string | null;
  designer_id: string | null;
  model: string | null;
  year: number | null;
  condition_id: string | null;
  occasion_id: string | null;
  silhouette_id: string | null;
  fabric_id: string | null;
  size_id: string | null;
  neckline_id: string | null;
  sleeve_style_id: string | null;
  length_id: string | null;
  color: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  original_retail_cents: number | null;
  alterations_text: string | null;
  has_original_receipt: boolean | null;
  location_postal: string | null;
};

type ImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
  byte_size: number;
  mime_type: string;
};

function dollarsFromCents(cents: number | null | undefined): string {
  if (cents == null || cents <= 0) return "";
  const d = cents / 100;
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; vis?: string }>;
}) {
  const { id } = await params;
  const { error, saved, vis } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  if (!/^\d+$/.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [listingRes, imagesRes, refs] = await Promise.all([
    query<ListingRow>(
      `SELECT id::text, title, description, price_cents, seller_id::text,
              is_published, offers_enabled, region_id::text,
              designer_id::text, model, year, condition_id::text,
              occasion_id::text, silhouette_id::text, fabric_id::text,
              size_id::text, neckline_id::text, sleeve_style_id::text,
              length_id::text, color,
              bust_inches::text, waist_inches::text, hips_inches::text,
              original_retail_cents, alterations_text,
              has_original_receipt, location_postal
         FROM listings
        WHERE id = $1::bigint
        LIMIT 1`,
      [id],
    ),
    query<ImageRow>(
      `SELECT id::text, is_primary, position, byte_size, mime_type
         FROM listing_images
        WHERE listing_id = $1::bigint
        ORDER BY is_primary DESC, position, id`,
      [id],
    ),
    loadListingRefOptions(),
  ]);

  const listing = listingRes.rows[0];
  if (!listing) notFound();
  if (listing.seller_id !== user.id && !user.isAdmin) {
    redirect(`/listings/${id}`);
  }

  const images = imagesRes.rows;

  const defaults: ListingFormDefaults = {
    description: listing.description,
    price_dollars: (listing.price_cents / 100).toFixed(2),
    region_id: listing.region_id,
    offers_enabled: listing.offers_enabled,
    designer_id: listing.designer_id,
    model: listing.model,
    year: listing.year,
    condition_id: listing.condition_id,
    occasion_id: listing.occasion_id,
    silhouette_id: listing.silhouette_id,
    fabric_id: listing.fabric_id,
    size_id: listing.size_id,
    neckline_id: listing.neckline_id,
    sleeve_style_id: listing.sleeve_style_id,
    length_id: listing.length_id,
    color: listing.color,
    bust_inches: listing.bust_inches,
    waist_inches: listing.waist_inches,
    hips_inches: listing.hips_inches,
    original_retail_dollars: dollarsFromCents(listing.original_retail_cents),
    alterations_text: listing.alterations_text,
    has_original_receipt: !!listing.has_original_receipt,
    location_postal: listing.location_postal,
  };

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 880, margin: "0 auto" }}>
        <Link href={`/listings/${id}`} className="back-link">
          ← Back to listing
        </Link>

        <p className="eyebrow">Edit listing</p>
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
          Update the details, swap photos, or set a different default.
        </p>

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}
        {saved && !errorMessage && (
          <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
            Saved.
          </p>
        )}
        {vis && !errorMessage && (
          <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
            Visibility updated.
          </p>
        )}

        <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
          <h2 className="card-heading">Visibility</h2>
          <p className="card-sub">
            {listing.is_published
              ? "Visible in browse and discoverable by other users."
              : "Hidden from browse — only you can see this listing."}
          </p>
          <form action={setListingVisibility}>
            <input type="hidden" name="listingId" value={id} />
            <label className="visibility-toggle">
              <input
                type="checkbox"
                name="is_published"
                defaultChecked={listing.is_published}
              />
              <span className="visibility-track" aria-hidden />
              <span className="visibility-label">
                Show in public browse results
              </span>
            </label>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "var(--s-3)",
              }}
            >
              <Button type="submit" variant="primary" size="sm">
                Update visibility
              </Button>
            </div>
          </form>
        </section>

        <ListingForm
          action={updateListing}
          refs={refs}
          defaults={defaults}
          hiddenFields={[{ name: "listingId", value: id }]}
          submitLabel="Save changes"
        />

        <section className="form-card" style={{ margin: "var(--s-7) 0" }}>
          <h2 className="card-heading">
            Photos{" "}
            <span style={{ color: "var(--ink-4)", fontWeight: 400 }}>
              ({images.length} / 10)
            </span>
          </h2>
          <form action={addListingImages} encType="multipart/form-data">
            <input type="hidden" name="listingId" value={id} />
            <Field
              label="Add photos"
              htmlFor="images"
              help="Up to 10 total · JPEG, PNG, WebP · 5 MB each."
            >
              <input
                id="images"
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="file-input"
                required
              />
            </Field>
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                justifyContent: "flex-end",
                marginTop: "var(--s-4)",
              }}
            >
              <Button type="submit" variant="primary" iconRight="arrow">
                Upload
              </Button>
            </div>
          </form>
        </section>

        {images.length === 0 ? (
          <div className="empty-state">
            <h3>No photos yet</h3>
            <p style={{ margin: 0 }}>
              Upload some above — the first one becomes the default.
            </p>
          </div>
        ) : (
          <div className="manage-grid">
            {images.map((img, i) => {
              // First image is the default (primary). Reorder buttons only
              // apply to the non-primary stack — index 1+ in the rendered list.
              const canMoveUp = !img.is_primary && i > 1;
              const canMoveDown = !img.is_primary && i < images.length - 1;
              return (
                <div
                  key={img.id}
                  className={`manage-tile ${img.is_primary ? "is-primary" : ""}`}
                >
                  <img
                    src={`/api/listings/${id}/images/${img.id}`}
                    alt=""
                    className="manage-photo"
                  />
                  {img.is_primary && (
                    <span className="manage-flag">Default</span>
                  )}
                  <div className="manage-meta">
                    {Math.round(img.byte_size / 1024)} KB ·{" "}
                    {img.mime_type.replace("image/", "")}
                  </div>
                  <div className="manage-actions">
                    {!img.is_primary && (
                      <form action={setPrimaryImage}>
                        <input type="hidden" name="listingId" value={id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Set as default"
                        >
                          ★ Set default
                        </Button>
                      </form>
                    )}
                    {canMoveUp && (
                      <form action={moveListingImage}>
                        <input type="hidden" name="listingId" value={id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Move up"
                        >
                          ↑ Up
                        </Button>
                      </form>
                    )}
                    {canMoveDown && (
                      <form action={moveListingImage}>
                        <input type="hidden" name="listingId" value={id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Move down"
                        >
                          ↓ Down
                        </Button>
                      </form>
                    )}
                    <form action={deleteListingImage}>
                      <input type="hidden" name="listingId" value={id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        title="Delete photo"
                      >
                        ✕ Delete
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "var(--s-8)" }}>
          <ButtonLink href={`/listings/${id}`} variant="dark" iconRight="arrow">
            Done
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}

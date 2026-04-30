import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  addListingImages,
  setPrimaryImage,
  deleteListingImage,
} from "@/lib/actions/listings";
import { Button, ButtonLink, Field } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "no-files": "Pick at least one photo to upload.",
  "too-many": "Listings can have at most 10 photos.",
  "too-large": "Each photo must be 5 MB or smaller.",
  "bad-type": "Photos must be JPEG, PNG, or WebP.",
  "upload-failed": "We couldn't save those photos — please try again.",
};

type ListingHead = {
  id: string;
  title: string;
  seller_id: string | null;
};

type ImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
  byte_size: number;
  mime_type: string;
};

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  if (!/^\d+$/.test(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const listingRes = await query<ListingHead>(
    `SELECT id::text, title, seller_id::text
       FROM listings
      WHERE id = $1::bigint
      LIMIT 1`,
    [id],
  );
  const listing = listingRes.rows[0];
  if (!listing) notFound();
  if (listing.seller_id !== user.id) redirect(`/listings/${id}`);

  const imagesRes = await query<ImageRow>(
    `SELECT id::text, is_primary, position, byte_size, mime_type
       FROM listing_images
      WHERE listing_id = $1::bigint
      ORDER BY is_primary DESC, position, id`,
    [id],
  );
  const images = imagesRes.rows;

  return (
    <div className="page" style={{ padding: "var(--s-9) var(--s-7)" }}>
      <main style={{ maxWidth: 880, margin: "0 auto" }}>
        <Link href={`/listings/${id}`} className="back-link">
          ← Back to listing
        </Link>

        <p className="eyebrow">Manage photos</p>
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
          {images.length} of 10 photos.{" "}
          {images.length > 0 &&
            "Click ★ to set the default, ✕ to delete."}
        </p>

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}

        <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
          <h2 style={{ font: "inherit", fontWeight: 700, margin: 0 }}>
            Upload photos
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
            {images.map((img) => (
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
            ))}
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

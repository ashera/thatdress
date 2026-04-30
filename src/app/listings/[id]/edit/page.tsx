import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  addListingImages,
  deleteListingImage,
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
  "invalid-title": "Title is required (200 characters or fewer).",
  "long-description": "Description must be 5,000 characters or fewer.",
  "invalid-price": "Enter a valid price in dollars (e.g. 1899 or 1899.00).",
  "invalid-make": "Pick a make.",
  "invalid-model": "Model is required.",
  "invalid-year": "Year must be between 2000 and next year.",
  "invalid-condition": "Pick a condition.",
  "invalid-class": "Pick a bike class.",
  "invalid-category": "Pick a bike category.",
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
  make_id: string | null;
  model: string | null;
  year: number | null;
  condition_id: string | null;
  bike_class_id: string | null;
  bike_category_id: string | null;
  location_postal: string | null;
  frame_size: string | null;
  frame_style_id: string | null;
  frame_material_id: string | null;
  gender_fit_id: string | null;
  wheel_size_id: string | null;
  suspension_type_id: string | null;
  brake_type_id: string | null;
  motor_brand_id: string | null;
  motor_type_id: string | null;
  motor_watts_nominal: number | null;
  motor_watts_peak: number | null;
  motor_torque_nm: number | null;
  battery_wh: number | null;
  battery_voltage: number | null;
  battery_amp_hours: string | null;
  charge_time_hours: string | null;
  top_speed_mph: number | null;
  range_miles_min: number | null;
  range_miles_max: number | null;
  drive_mode_id: string | null;
  mileage: number | null;
  color: string | null;
  weight_lbs: string | null;
  display_type: string | null;
  drivetrain: string | null;
  accessories: string | null;
  modifications: string | null;
  has_warranty: boolean | null;
  warranty_text: string | null;
  has_original_receipt: boolean | null;
  body_position_id: string | null;
};

type ImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
  byte_size: number;
  mime_type: string;
};

function nullableNumber(s: string | null): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
              is_published,
              make_id::text, model, year, condition_id::text,
              bike_class_id::text, bike_category_id::text, location_postal,
              frame_size, frame_style_id::text, frame_material_id::text,
              gender_fit_id::text, wheel_size_id::text,
              suspension_type_id::text, brake_type_id::text,
              motor_brand_id::text, motor_type_id::text,
              motor_watts_nominal, motor_watts_peak, motor_torque_nm,
              battery_wh, battery_voltage, battery_amp_hours::text,
              charge_time_hours::text, top_speed_mph, range_miles_min,
              range_miles_max, drive_mode_id::text, mileage, color,
              weight_lbs::text, display_type, drivetrain, accessories,
              modifications, has_warranty, warranty_text,
              has_original_receipt, body_position_id::text
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
  if (listing.seller_id !== user.id) redirect(`/listings/${id}`);

  const images = imagesRes.rows;

  const defaults: ListingFormDefaults = {
    title: listing.title,
    description: listing.description,
    price_dollars: (listing.price_cents / 100).toFixed(2),
    make_id: listing.make_id,
    model: listing.model,
    year: listing.year,
    condition_id: listing.condition_id,
    bike_class_id: listing.bike_class_id,
    bike_category_id: listing.bike_category_id,
    location_postal: listing.location_postal,
    frame_size: listing.frame_size,
    frame_style_id: listing.frame_style_id,
    frame_material_id: listing.frame_material_id,
    gender_fit_id: listing.gender_fit_id,
    wheel_size_id: listing.wheel_size_id,
    suspension_type_id: listing.suspension_type_id,
    brake_type_id: listing.brake_type_id,
    motor_brand_id: listing.motor_brand_id,
    motor_type_id: listing.motor_type_id,
    motor_watts_nominal: listing.motor_watts_nominal,
    motor_watts_peak: listing.motor_watts_peak,
    motor_torque_nm: listing.motor_torque_nm,
    battery_wh: listing.battery_wh,
    battery_voltage: listing.battery_voltage,
    battery_amp_hours: nullableNumber(listing.battery_amp_hours),
    charge_time_hours: nullableNumber(listing.charge_time_hours),
    top_speed_mph: listing.top_speed_mph,
    range_miles_min: listing.range_miles_min,
    range_miles_max: listing.range_miles_max,
    drive_mode_id: listing.drive_mode_id,
    mileage: listing.mileage,
    color: listing.color,
    weight_lbs: nullableNumber(listing.weight_lbs),
    display_type: listing.display_type,
    drivetrain: listing.drivetrain,
    accessories: listing.accessories,
    modifications: listing.modifications,
    has_warranty: !!listing.has_warranty,
    warranty_text: listing.warranty_text,
    has_original_receipt: !!listing.has_original_receipt,
    body_position_id: listing.body_position_id,
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ButtonLink } from "../../_components/ui";
import {
  ListingRow,
  listingFromRow,
  type ListingCardRow,
} from "../../_components/listing-card";

export const dynamic = "force-dynamic";

type Row = ListingCardRow & { is_published: boolean };

async function fetchOwnListings(
  userId: string,
): Promise<{ ok: true; rows: Row[] } | { ok: false; error: string }> {
  try {
    const result = await query<Row>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              u.email AS seller_email,
              l.is_published,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              mk.name AS make_name, l.model, l.year,
              cg.label AS condition_label,
              bcl.label AS bike_class_label,
              bcat.label AS bike_category_label,
              l.location_postal,
              l.frame_size,
              fs.label AS frame_style_label,
              fm.label AS frame_material_label,
              gf.label AS gender_fit_label,
              ws.label AS wheel_size_label,
              st.label AS suspension_type_label,
              bt.label AS brake_type_label,
              mb.name AS motor_brand_name,
              mt.label AS motor_type_label,
              l.motor_watts_nominal, l.battery_wh, l.top_speed_mph,
              l.range_miles_min, l.range_miles_max,
              dm.label AS drive_mode_label,
              l.mileage, l.color, l.weight_lbs::text, l.has_warranty
         FROM listings l
         LEFT JOIN users            u    ON u.id    = l.seller_id
         LEFT JOIN bike_makes       mk   ON mk.id   = l.make_id
         LEFT JOIN condition_grades cg   ON cg.id   = l.condition_id
         LEFT JOIN bike_classes     bcl  ON bcl.id  = l.bike_class_id
         LEFT JOIN bike_categories  bcat ON bcat.id = l.bike_category_id
         LEFT JOIN frame_styles     fs   ON fs.id   = l.frame_style_id
         LEFT JOIN frame_materials  fm   ON fm.id   = l.frame_material_id
         LEFT JOIN gender_fits      gf   ON gf.id   = l.gender_fit_id
         LEFT JOIN wheel_sizes      ws   ON ws.id   = l.wheel_size_id
         LEFT JOIN suspension_types st   ON st.id   = l.suspension_type_id
         LEFT JOIN brake_types      bt   ON bt.id   = l.brake_type_id
         LEFT JOIN motor_brands     mb   ON mb.id   = l.motor_brand_id
         LEFT JOIN motor_types      mt   ON mt.id   = l.motor_type_id
         LEFT JOIN drive_modes      dm   ON dm.id   = l.drive_mode_id
        WHERE l.seller_id = $1::bigint
        ORDER BY l.is_published DESC, l.created_at DESC
        LIMIT 200`,
      [userId],
    );
    return { ok: true, rows: result.rows };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await fetchOwnListings(user.id);
  const total = result.ok ? result.rows.length : 0;
  const hidden = result.ok
    ? result.rows.filter((r) => !r.is_published).length
    : 0;

  return (
    <div className="page page--pad">
      <header className="my-listings-header">
        <p className="eyebrow">Your listings</p>
        <h1>My listings</h1>
        <p className="sub">
          {total === 0
            ? "You haven't posted any listings yet."
            : `${total} total · ${hidden} hidden from public browse.`}
        </p>
      </header>

      <div style={{ marginBottom: "var(--s-5)" }}>
        <ButtonLink href="/listings/new" variant="primary" icon="plus">
          New listing
        </ButtonLink>
      </div>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load your listings.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No listings yet</h3>
          <p style={{ margin: 0 }}>
            <Link href="/listings/new">Create your first listing</Link> when
            you&rsquo;re ready.
          </p>
        </div>
      ) : (
        <div className="results-rows">
          {result.rows.map((row) => (
            <div
              key={row.id}
              className={`my-listing-wrap ${row.is_published ? "" : "is-hidden"}`}
            >
              {!row.is_published && (
                <span className="my-listing-flag">Hidden</span>
              )}
              <ListingRow data={listingFromRow(row)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

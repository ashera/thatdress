import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getShortlistIds } from "@/lib/shortlist";
import {
  ignoreFromShortlist,
  reinstateShortlist,
  removeFromShortlist,
} from "@/lib/actions/shortlist";
import { Button, ButtonLink } from "../_components/ui";
import {
  ListingCard,
  listingFromRow,
  type ListingCardRow,
} from "../_components/listing-card";

export const dynamic = "force-dynamic";

type Row = ListingCardRow & {
  shortlisted_at: string;
  ignored_at: string | null;
};

async function fetchShortlistedListings(userId: string) {
  try {
    const result = await query<Row>(
      `SELECT l.id::text,
              l.title,
              l.price_cents,
              l.seller_id::text,
              u.email AS seller_email,
              (
                SELECT li.id::text FROM listing_images li
                  WHERE li.listing_id = l.id
                  ORDER BY li.is_primary DESC, li.position, li.id
                  LIMIT 1
              ) AS primary_image_id,
              mk.name   AS make_name,
              l.model,
              l.year,
              cg.label  AS condition_label,
              bcl.label AS bike_class_label,
              bcat.label AS bike_category_label,
              l.location_postal,
              l.frame_size,
              fs.label  AS frame_style_label,
              fm.label  AS frame_material_label,
              gf.label  AS gender_fit_label,
              ws.label  AS wheel_size_label,
              st.label  AS suspension_type_label,
              bt.label  AS brake_type_label,
              mb.name   AS motor_brand_name,
              mt.label  AS motor_type_label,
              l.motor_watts_nominal,
              l.battery_wh,
              l.top_speed_mph,
              l.range_miles_min,
              l.range_miles_max,
              dm.label  AS drive_mode_label,
              l.mileage,
              l.color,
              l.weight_lbs::text,
              l.has_warranty,
              l.is_published,
              s.created_at::text AS shortlisted_at,
              s.ignored_at::text AS ignored_at
         FROM shortlists s
         JOIN listings l ON l.id = s.listing_id
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
        WHERE s.user_id = $1::bigint
        ORDER BY (s.ignored_at IS NOT NULL), s.created_at DESC`,
      [userId],
    );
    return { ok: true as const, rows: result.rows };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

function ManageControls({
  listingId,
  ignored,
}: {
  listingId: string;
  ignored: boolean;
}) {
  if (!ignored) {
    return (
      <form action={ignoreFromShortlist} className="shortlist-manage">
        <input type="hidden" name="listingId" value={listingId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          title="Move to ignored"
        >
          Ignore
        </Button>
      </form>
    );
  }
  return (
    <div className="shortlist-manage">
      <form action={reinstateShortlist}>
        <input type="hidden" name="listingId" value={listingId} />
        <Button type="submit" variant="primary" size="sm">
          Reinstate
        </Button>
      </form>
      <form action={removeFromShortlist}>
        <input type="hidden" name="listingId" value={listingId} />
        <Button type="submit" variant="ghost" size="sm">
          Remove
        </Button>
      </form>
    </div>
  );
}

export default async function ShortlistPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/shortlist");

  const [result, ids] = await Promise.all([
    fetchShortlistedListings(user.id),
    getShortlistIds(user.id),
  ]);

  const total = result.ok ? result.rows.length : 0;
  const activeCount = result.ok
    ? result.rows.filter((r) => !r.ignored_at).length
    : 0;
  const ignoredCount = total - activeCount;

  return (
    <div className="page page--pad">
      <header className="messages-header">
        <p className="eyebrow">Saved</p>
        <h1>Your shortlist</h1>
        <p className="sub">
          {total === 0
            ? "Nothing saved yet."
            : `${activeCount} saved${ignoredCount > 0 ? ` · ${ignoredCount} ignored` : ""}.`}
        </p>
      </header>

      {!result.ok ? (
        <div className="form-error">
          <strong>Could not load your shortlist.</strong>
          <div style={{ marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {result.error}
          </div>
        </div>
      ) : result.rows.length === 0 ? (
        <div className="empty-state">
          <h3>No saved listings yet</h3>
          <p style={{ margin: "0 0 var(--s-5)" }}>
            Tap the <strong>♥</strong> on any listing to save it for later.
          </p>
          <ButtonLink href="/listings" variant="primary" iconRight="arrow">
            Browse listings
          </ButtonLink>
        </div>
      ) : (
        <div className="results-grid">
          {result.rows.map((row) => {
            const data = listingFromRow(row, user.id, ids);
            // Hide the photo heart toggle on /shortlist — explicit
            // controls below the card handle ignore / reinstate / remove.
            data.showShortlist = false;
            const ignored = !!row.ignored_at;
            return (
              <div
                key={row.id}
                className={`shortlist-item ${ignored ? "is-ignored" : ""}`}
              >
                {ignored && <span className="shortlist-flag">Ignored</span>}
                <ListingCard data={data} />
                <ManageControls listingId={row.id} ignored={ignored} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

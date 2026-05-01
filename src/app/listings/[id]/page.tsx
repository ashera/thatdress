import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentRegionId } from "@/lib/regions";
import { startConversation } from "@/lib/actions/messages";
import { Button, ButtonLink } from "../../_components/ui";
import {
  ListingGallery,
  type GalleryImage,
} from "../../_components/listing-gallery";

export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  created_at: string;
  seller_email: string | null;
  seller_id: string | null;
  is_published: boolean;
  region_id: string | null;
  conversation_count: string;
  // detail fields
  make_name: string | null;
  model: string | null;
  year: number | null;
  condition_label: string | null;
  bike_class_label: string | null;
  bike_category_label: string | null;
  location_postal: string | null;
  frame_size: string | null;
  frame_style_label: string | null;
  frame_material_label: string | null;
  gender_fit_label: string | null;
  wheel_size_label: string | null;
  suspension_type_label: string | null;
  brake_type_label: string | null;
  motor_brand_name: string | null;
  motor_type_label: string | null;
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
  drive_mode_label: string | null;
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
  body_position_label: string | null;
};

type ImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
};

const LISTING_SELECT = `
  l.id::text,
  l.title,
  l.description,
  l.price_cents,
  l.created_at::text,
  l.seller_id::text,
  l.is_published,
  l.region_id::text,
  (
    SELECT COUNT(DISTINCT buyer_id)::text FROM conversations
      WHERE listing_id = l.id
  ) AS conversation_count,
  u.email AS seller_email,
  mk.name AS make_name,
  l.model,
  l.year,
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
  l.motor_watts_nominal, l.motor_watts_peak, l.motor_torque_nm,
  l.battery_wh, l.battery_voltage,
  l.battery_amp_hours::text,
  l.charge_time_hours::text,
  l.top_speed_mph, l.range_miles_min, l.range_miles_max,
  dm.label AS drive_mode_label,
  l.mileage, l.color,
  l.weight_lbs::text,
  l.display_type, l.drivetrain, l.accessories, l.modifications,
  l.has_warranty, l.warranty_text, l.has_original_receipt,
  bp.label AS body_position_label
`;

const LISTING_JOINS = `
  LEFT JOIN users            u   ON u.id   = l.seller_id
  LEFT JOIN bike_makes       mk  ON mk.id  = l.make_id
  LEFT JOIN condition_grades cg  ON cg.id  = l.condition_id
  LEFT JOIN bike_classes     bcl ON bcl.id = l.bike_class_id
  LEFT JOIN bike_categories  bcat ON bcat.id = l.bike_category_id
  LEFT JOIN frame_styles     fs  ON fs.id  = l.frame_style_id
  LEFT JOIN frame_materials  fm  ON fm.id  = l.frame_material_id
  LEFT JOIN gender_fits      gf  ON gf.id  = l.gender_fit_id
  LEFT JOIN wheel_sizes      ws  ON ws.id  = l.wheel_size_id
  LEFT JOIN suspension_types st  ON st.id  = l.suspension_type_id
  LEFT JOIN brake_types      bt  ON bt.id  = l.brake_type_id
  LEFT JOIN motor_brands     mb  ON mb.id  = l.motor_brand_id
  LEFT JOIN motor_types      mt  ON mt.id  = l.motor_type_id
  LEFT JOIN drive_modes      dm  ON dm.id  = l.drive_mode_id
  LEFT JOIN body_positions   bp  ON bp.id  = l.body_position_id
`;

async function fetchListing(id: string): Promise<
  | { ok: true; listing: ListingRow | null; images: GalleryImage[] }
  | { ok: false; error: string }
> {
  if (!/^\d+$/.test(id)) return { ok: true, listing: null, images: [] };
  try {
    const result = await query<ListingRow>(
      `SELECT ${LISTING_SELECT}
         FROM listings l
         ${LISTING_JOINS}
        WHERE l.id = $1::bigint
        LIMIT 1`,
      [id],
    );
    const listing = result.rows[0] ?? null;
    if (!listing) return { ok: true, listing: null, images: [] };

    const imgRes = await query<ImageRow>(
      `SELECT id::text, is_primary, position
         FROM listing_images
        WHERE listing_id = $1::bigint
        ORDER BY is_primary DESC, position, id`,
      [id],
    );
    const images: GalleryImage[] = imgRes.rows.map((r) => ({
      id: r.id,
      src: `/api/listings/${id}/images/${r.id}`,
      isPrimary: r.is_primary,
    }));
    return { ok: true, listing, images };
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

function fmtNum(n: number | string | null | undefined, suffix = ""): string | null {
  if (n === null || n === undefined || n === "") return null;
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return null;
  return `${num}${suffix}`;
}

function rangeStr(
  min: number | null,
  max: number | null,
  suffix: string,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

type Spec = { k: string; v: string };

function buildSpecs(l: ListingRow): { group: string; items: Spec[] }[] {
  const overview: Spec[] = [];
  if (l.make_name) overview.push({ k: "Make", v: l.make_name });
  if (l.model) overview.push({ k: "Model", v: l.model });
  if (l.year) overview.push({ k: "Year", v: String(l.year) });
  if (l.condition_label) overview.push({ k: "Condition", v: l.condition_label });
  if (l.bike_class_label)
    overview.push({ k: "Class", v: l.bike_class_label });
  if (l.bike_category_label)
    overview.push({ k: "Category", v: l.bike_category_label });
  if (l.location_postal)
    overview.push({ k: "Location", v: l.location_postal });

  const build: Spec[] = [];
  if (l.frame_size) build.push({ k: "Frame size", v: l.frame_size });
  if (l.frame_style_label)
    build.push({ k: "Frame style", v: l.frame_style_label });
  if (l.frame_material_label)
    build.push({ k: "Material", v: l.frame_material_label });
  if (l.gender_fit_label) build.push({ k: "Fit", v: l.gender_fit_label });
  if (l.wheel_size_label) build.push({ k: "Wheels", v: l.wheel_size_label });
  if (l.suspension_type_label)
    build.push({ k: "Suspension", v: l.suspension_type_label });
  if (l.brake_type_label) build.push({ k: "Brakes", v: l.brake_type_label });
  if (l.color) build.push({ k: "Color", v: l.color });

  const motor: Spec[] = [];
  if (l.motor_brand_name)
    motor.push({ k: "Motor brand", v: l.motor_brand_name });
  if (l.motor_type_label)
    motor.push({ k: "Motor type", v: l.motor_type_label });
  const watts = fmtNum(l.motor_watts_nominal, " W");
  if (watts) motor.push({ k: "Motor (nominal)", v: watts });
  const peakW = fmtNum(l.motor_watts_peak, " W");
  if (peakW) motor.push({ k: "Motor (peak)", v: peakW });
  const torque = fmtNum(l.motor_torque_nm, " Nm");
  if (torque) motor.push({ k: "Torque", v: torque });
  const wh = fmtNum(l.battery_wh, " Wh");
  if (wh) motor.push({ k: "Battery", v: wh });
  const v = fmtNum(l.battery_voltage, " V");
  if (v) motor.push({ k: "Battery voltage", v });
  const ah = fmtNum(l.battery_amp_hours, " Ah");
  if (ah) motor.push({ k: "Battery Ah", v: ah });
  const charge = fmtNum(l.charge_time_hours, " hr");
  if (charge) motor.push({ k: "Charge time", v: charge });
  const top = fmtNum(l.top_speed_mph, " mph");
  if (top) motor.push({ k: "Top speed", v: top });
  const range = rangeStr(l.range_miles_min, l.range_miles_max, " mi");
  if (range) motor.push({ k: "Range", v: range });
  if (l.drive_mode_label)
    motor.push({ k: "Drive mode", v: l.drive_mode_label });
  if (l.display_type) motor.push({ k: "Display", v: l.display_type });
  if (l.drivetrain) motor.push({ k: "Drivetrain", v: l.drivetrain });

  const usage: Spec[] = [];
  const mileage = fmtNum(l.mileage, " mi");
  if (mileage) usage.push({ k: "Mileage", v: mileage });
  const weight = fmtNum(l.weight_lbs, " lb");
  if (weight) usage.push({ k: "Weight", v: weight });
  if (l.body_position_label)
    usage.push({ k: "Body position", v: l.body_position_label });
  if (l.has_warranty) usage.push({ k: "Warranty", v: "Yes" });
  if (l.warranty_text) usage.push({ k: "Warranty notes", v: l.warranty_text });
  if (l.has_original_receipt)
    usage.push({ k: "Original receipt", v: "Yes" });

  const groups = [
    { group: "Overview", items: overview },
    { group: "Build", items: build },
    { group: "Motor & battery", items: motor },
    { group: "Use & history", items: usage },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, currentUser, regionId] = await Promise.all([
    fetchListing(id),
    getCurrentUser(),
    getCurrentRegionId(),
  ]);

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
  const isOwner = currentUser != null && currentUser.id === l.seller_id;
  const isAdmin = currentUser?.isAdmin ?? false;
  if (!l.is_published && !isOwner && !isAdmin) notFound();
  // Hide listings outside the viewer's region (unless they own it or are admin).
  if (
    l.region_id &&
    regionId &&
    l.region_id !== regionId &&
    !isOwner &&
    !isAdmin
  ) {
    notFound();
  }
  const price = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(l.price_cents / 100);
  const sellerName = l.seller_email
    ? (l.seller_email.split("@")[0] ?? l.seller_email)
    : "Unknown seller";

  const specGroups = buildSpecs(l);

  return (
    <div className="page detail-page">
      <Link href="/listings" className="back-link">
        ← Back to browse
      </Link>

      {!l.is_published && (isOwner || isAdmin) && (
        <div className="hidden-banner">
          <strong>Hidden from browse.</strong>
          <span>
            {isOwner
              ? "Only you can see this listing."
              : "Visible to admins only."}{" "}
            {isOwner && (
              <>
                Toggle visibility on the{" "}
                <Link href={`/listings/${l.id}/edit`}>edit page</Link>.
              </>
            )}
          </span>
        </div>
      )}

      <article className="detail">
        <ListingGallery images={result.images} />

        <div className="detail-body">
          <p className="eyebrow">
            {[l.year, l.bike_category_label].filter(Boolean).join(" · ") ||
              "Used eBike"}
          </p>
          <h1 className="detail-title">{l.title}</h1>
          <div className="detail-price">{price}</div>

          <div className="detail-seller">
            <span className="avatar">{initials(l.seller_email)}</span>
            <div>
              <div className="who">{sellerName}</div>
              <div className="when">
                Posted {formatPostedDate(l.created_at)}
                {l.location_postal ? ` · ${l.location_postal}` : ""}
              </div>
            </div>
          </div>

          {(() => {
            const interested = Number(l.conversation_count ?? 0);
            if (interested === 0) return null;
            const noun = interested === 1 ? "buyer has" : "buyers have";
            return (
              <p className="detail-interest">
                <strong>{interested}</strong>{" "}
                {isOwner ? (
                  <>
                    {noun} messaged you about this listing.{" "}
                    <Link href="/messages">Open inbox →</Link>
                  </>
                ) : (
                  <>{noun} asked the seller about this bike.</>
                )}
              </p>
            );
          })()}

          {l.description ? (
            <p className="detail-desc">{l.description}</p>
          ) : (
            <p className="detail-desc detail-desc--empty">
              No description provided.
            </p>
          )}

          <div className="detail-actions">
            {!isOwner && l.seller_id && currentUser ? (
              <form action={startConversation}>
                <input type="hidden" name="listingId" value={l.id} />
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  iconRight="msg"
                >
                  Contact seller
                </Button>
              </form>
            ) : !isOwner && l.seller_id ? (
              <ButtonLink
                href={`/login?next=${encodeURIComponent(`/listings/${l.id}`)}`}
                variant="primary"
                size="lg"
                iconRight="arrow"
              >
                Log in to contact seller
              </ButtonLink>
            ) : null}
            <ButtonLink href="/listings" variant="ghost" size="lg">
              See more bikes
            </ButtonLink>
            {(isOwner || isAdmin) && (
              <ButtonLink
                href={`/listings/${l.id}/edit`}
                variant="quiet"
                size="lg"
              >
                {isOwner ? "Edit listing" : "Edit (admin)"}
              </ButtonLink>
            )}
          </div>
        </div>
      </article>

      {specGroups.length > 0 && (
        <section className="detail-specs">
          <h2 className="detail-specs-heading">Specs</h2>
          <div className="detail-specs-grid">
            {specGroups.map((g) => (
              <div key={g.group} className="detail-specs-group">
                <h3>{g.group}</h3>
                <dl>
                  {g.items.map((s) => (
                    <div key={s.k} className="detail-spec-row">
                      <dt>{s.k}</dt>
                      <dd>{s.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {(l.accessories || l.modifications) && (
            <div className="detail-notes">
              {l.accessories && (
                <div>
                  <h4>Accessories</h4>
                  <p>{l.accessories}</p>
                </div>
              )}
              {l.modifications && (
                <div>
                  <h4>Modifications</h4>
                  <p>{l.modifications}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

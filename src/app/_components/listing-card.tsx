import { ButtonLink } from "./ui";

export type StatIcon = "range" | "battery" | "speed" | "weight";

export type ListingCardStat = {
  icon: StatIcon;
  value: string;
  label: string;
};

export type ListingCardData = {
  id: string;
  title: string;
  tagline?: string | null;
  price: string;
  chips: string[];
  stats: ListingCardStat[];
  highlights: string[];
  photo?: string;
};

export type ListingCardRow = {
  id: string;
  title: string;
  price_cents: number;
  seller_email: string | null;
  primary_image_id?: string | null;
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
  battery_wh: number | null;
  top_speed_mph: number | null;
  range_miles_min: number | null;
  range_miles_max: number | null;
  drive_mode_label: string | null;
  mileage: number | null;
  color: string | null;
  weight_lbs: string | null;
  has_warranty: boolean | null;
};

function compactClass(label: string | null): string | null {
  if (!label) return null;
  const m = label.match(/^Class\s+(\d)/i);
  return m ? `Class ${m[1]}` : label;
}

function fmtRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} mi`;
  return `${min ?? max} mi`;
}

function buildChips(row: ListingCardRow): string[] {
  const chips: string[] = [];
  const cls = compactClass(row.bike_class_label);
  if (cls) chips.push(cls);
  if (row.top_speed_mph != null) chips.push(`${row.top_speed_mph} mph`);
  if (row.drive_mode_label) chips.push(row.drive_mode_label);
  else if (row.bike_category_label) chips.push(row.bike_category_label);
  if (row.condition_label && chips.length < 3) chips.push(row.condition_label);
  return chips.slice(0, 3);
}

const PLACEHOLDER = "-";

function buildStats(row: ListingCardRow): ListingCardStat[] {
  const range = fmtRange(row.range_miles_min, row.range_miles_max);

  let weightValue = PLACEHOLDER;
  if (row.weight_lbs) {
    const n = Number(row.weight_lbs);
    if (Number.isFinite(n)) weightValue = `${n} lb`;
  }

  return [
    { icon: "range", value: range ?? PLACEHOLDER, label: "Range" },
    {
      icon: "battery",
      value: row.battery_wh != null ? `${row.battery_wh} Wh` : PLACEHOLDER,
      label: "Battery",
    },
    {
      icon: "speed",
      value:
        row.top_speed_mph != null ? `${row.top_speed_mph} mph` : PLACEHOLDER,
      label: "Top speed",
    },
    { icon: "weight", value: weightValue, label: "Weight" },
  ];
}

function buildHighlights(row: ListingCardRow): string[] {
  const out: string[] = [];

  const brake = row.brake_type_label;
  if (brake) {
    if (/disc/i.test(brake)) out.push(`${brake} brakes`);
    else out.push(`${brake} brakes`);
  }

  if (row.has_warranty) out.push("Comprehensive warranty included");

  if (
    row.motor_brand_name &&
    row.motor_type_label &&
    !out.some((s) => s.includes("motor"))
  ) {
    out.push(`${row.motor_brand_name} ${row.motor_type_label} motor`);
  }

  if (
    row.suspension_type_label &&
    !/none|rigid/i.test(row.suspension_type_label) &&
    out.length < 3
  ) {
    out.push(`${row.suspension_type_label} suspension`);
  }

  if (row.frame_material_label && out.length < 3) {
    out.push(`${row.frame_material_label} frame`);
  }

  if (row.frame_style_label && out.length < 3) {
    out.push(`${row.frame_style_label} frame design`);
  }

  if (row.wheel_size_label && out.length < 3) {
    out.push(`${row.wheel_size_label} wheels`);
  }

  return out.slice(0, 3);
}

function buildTagline(row: ListingCardRow): string | null {
  const parts: string[] = [];
  if (row.year) parts.push(String(row.year));
  if (row.make_name) parts.push(row.make_name);
  if (row.model) parts.push(row.model);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function listingFromRow(row: ListingCardRow): ListingCardData {
  const priceFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  return {
    id: row.id,
    title: row.title,
    tagline: buildTagline(row),
    price: priceFmt.format(row.price_cents / 100),
    chips: buildChips(row),
    stats: buildStats(row),
    highlights: buildHighlights(row),
    photo: row.primary_image_id
      ? `/api/listings/${row.id}/images/${row.primary_image_id}`
      : undefined,
  };
}

export function ListingCard({ data }: { data: ListingCardData }) {
  const detailHref = `/listings/${data.id}`;
  return (
    <article className="listing">
      <div className="listing-head">
        {data.chips.length > 0 && (
          <div className="listing-chips">
            {data.chips.map((c, i) => (
              <span key={`${c}-${i}`} className="listing-chip">
                {c}
              </span>
            ))}
          </div>
        )}
        <h3 className="listing-title">{data.title}</h3>
        {data.tagline && <p className="listing-tagline">{data.tagline}</p>}
      </div>

      <div className="listing-photo">
        {data.photo ? (
          <img src={data.photo} alt={data.title} loading="lazy" />
        ) : (
          <span className="listing-photo-empty">eBike photo</span>
        )}
      </div>

      <div className="listing-stats">
        {data.stats.map((s, i) => (
          <div key={`${s.label}-${i}`} className="listing-stat">
            <img
              src={`/images/${s.icon}.png`}
              alt=""
              className="listing-stat-icon"
              width={28}
              height={28}
            />
            <span className={`v ${s.value === PLACEHOLDER ? "is-empty" : ""}`}>
              {s.value}
            </span>
            <span className="k">{s.label}</span>
          </div>
        ))}
      </div>

      {data.highlights.length > 0 && (
        <ul className="listing-highlights">
          {data.highlights.map((h, i) => (
            <li key={`${h}-${i}`}>
              <Icon name="check" size="sm" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="listing-foot">
        <div className="listing-price">{data.price}</div>
        <ButtonLink
          href={detailHref}
          variant="primary"
          iconRight="arrow"
          className="listing-cta"
        >
          View Specs &amp; Photos
        </ButtonLink>
      </div>
    </article>
  );
}

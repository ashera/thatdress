import { ButtonLink, Icon } from "./ui";

export type StatIcon = "range" | "battery" | "speed" | "weight";

export type ListingCardStat = {
  icon: StatIcon;
  value: string;
  label: string;
};

export type ListingCardData = {
  id: string;
  title: string;
  tagline: { year: string; make: string; model: string };
  price: string;
  chips: [string, string, string];
  stats: ListingCardStat[];
  highlights: [string | null, string | null, string | null];
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

function buildChips(row: ListingCardRow): [string, string, string] {
  return [
    compactClass(row.bike_class_label) ?? PLACEHOLDER,
    row.top_speed_mph != null ? `${row.top_speed_mph} mph` : PLACEHOLDER,
    row.drive_mode_label ?? row.bike_category_label ?? PLACEHOLDER,
  ];
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

function buildHighlights(row: ListingCardRow): [string | null, string | null, string | null] {
  const out: string[] = [];

  if (row.brake_type_label) out.push(`${row.brake_type_label} brakes`);
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

  return [out[0] ?? null, out[1] ?? null, out[2] ?? null];
}

function buildTagline(row: ListingCardRow): {
  year: string;
  make: string;
  model: string;
} {
  return {
    year: row.year ? String(row.year) : PLACEHOLDER,
    make: row.make_name ?? PLACEHOLDER,
    model: row.model ?? PLACEHOLDER,
  };
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
        <div className="listing-chips">
          {data.chips.map((c, i) => (
            <span
              key={i}
              className={`listing-chip ${c === PLACEHOLDER ? "is-empty" : ""}`}
            >
              {c}
            </span>
          ))}
        </div>
        <h3 className="listing-title">{data.title}</h3>
        <p className="listing-tagline">
          <span className={data.tagline.year === PLACEHOLDER ? "is-empty" : ""}>
            {data.tagline.year}
          </span>
          <span className="sep" aria-hidden> · </span>
          <span className={data.tagline.make === PLACEHOLDER ? "is-empty" : ""}>
            {data.tagline.make}
          </span>
          <span className="sep" aria-hidden> · </span>
          <span className={data.tagline.model === PLACEHOLDER ? "is-empty" : ""}>
            {data.tagline.model}
          </span>
        </p>
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

      <ul className="listing-highlights">
        {data.highlights.map((h, i) => (
          <li key={i} className={h ? "" : "is-empty"} aria-hidden={!h}>
            <Icon name="check" size="sm" />
            <span>{h ?? "—"}</span>
          </li>
        ))}
      </ul>

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

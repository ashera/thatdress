import type { ListingRefOptions, RefOption } from "@/lib/ref-data";
import { Button, Field, Input, Textarea } from "./ui";

export type ListingFormDefaults = {
  description?: string | null;
  price_dollars?: string;
  offers_enabled?: boolean;
  region_id?: string | null;
  make_id?: string | null;
  model?: string | null;
  year?: number | null;
  condition_id?: string | null;
  bike_class_id?: string | null;
  bike_category_id?: string | null;
  location_postal?: string | null;
  frame_size?: string | null;
  frame_style_id?: string | null;
  frame_material_id?: string | null;
  gender_fit_id?: string | null;
  wheel_size_id?: string | null;
  suspension_type_id?: string | null;
  brake_type_id?: string | null;
  motor_brand_id?: string | null;
  motor_type_id?: string | null;
  motor_watts_nominal?: number | null;
  motor_watts_peak?: number | null;
  motor_torque_nm?: number | null;
  battery_wh?: number | null;
  battery_voltage?: number | null;
  battery_amp_hours?: number | null;
  charge_time_hours?: number | null;
  top_speed_mph?: number | null;
  range_miles_min?: number | null;
  range_miles_max?: number | null;
  drive_mode_id?: string | null;
  mileage?: number | null;
  color?: string | null;
  weight_lbs?: number | null;
  display_type?: string | null;
  drivetrain?: string | null;
  accessories?: string | null;
  modifications?: string | null;
  has_warranty?: boolean;
  warranty_text?: string | null;
  has_original_receipt?: boolean;
  body_position_id?: string | null;
};

type Props = {
  action: (formData: FormData) => Promise<void>;
  refs: ListingRefOptions;
  defaults?: ListingFormDefaults;
  hiddenFields?: Array<{ name: string; value: string }>;
  submitLabel: string;
  errorMessage?: string | null;
  showPhotos?: boolean;
};

function Select({
  name,
  options,
  defaultValue,
  required,
  placeholder = "—",
}: {
  name: string;
  options: RefOption[];
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      className="input"
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function nullishStr(v: string | number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

const CURRENT_YEAR = new Date().getUTCFullYear();

export function ListingForm({
  action,
  refs,
  defaults = {},
  hiddenFields = [],
  submitLabel,
  errorMessage,
  showPhotos = false,
}: Props) {
  return (
    <form
      action={action}
      encType="multipart/form-data"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-7)",
      }}
    >
      {hiddenFields.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}

      <section className="form-card">
        <h2 className="card-heading">Basics</h2>
        <p className="card-sub">Required to publish a listing.</p>

        <Field
          label="Region"
          htmlFor="region_id"
          help="Defaults to your current region. Buyers in this region will see the listing."
        >
          <Select
            name="region_id"
            options={refs.regions}
            defaultValue={defaults.region_id}
            required
            placeholder={
              refs.regions.length === 0
                ? "No regions configured"
                : "Select a region"
            }
          />
        </Field>

        <Field label="Make" htmlFor="make_id">
          <Select
            name="make_id"
            options={refs.makes}
            defaultValue={defaults.make_id}
            required
            placeholder="Select a make"
          />
        </Field>

        <Field label="Model" htmlFor="model" help="Free text — e.g. Turbo Vado 4.0.">
          <Input
            id="model"
            name="model"
            required
            maxLength={100}
            defaultValue={defaults.model ?? ""}
          />
        </Field>

        <div className="grid-2">
          <Field label="Year" htmlFor="year">
            <Input
              id="year"
              name="year"
              type="number"
              required
              min={2000}
              max={CURRENT_YEAR + 1}
              defaultValue={nullishStr(defaults.year)}
            />
          </Field>
          <Field label="Condition" htmlFor="condition_id">
            <Select
              name="condition_id"
              options={refs.conditions}
              defaultValue={defaults.condition_id}
              required
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Class" htmlFor="bike_class_id">
            <Select
              name="bike_class_id"
              options={refs.classes}
              defaultValue={defaults.bike_class_id}
              required
            />
          </Field>
          <Field label="Category" htmlFor="bike_category_id">
            <Select
              name="bike_category_id"
              options={refs.categories}
              defaultValue={defaults.bike_category_id}
              required
            />
          </Field>
        </div>

        <p className="card-sub" style={{ marginTop: 0 }}>
          The listing title shows up automatically as &ldquo;Year Make
          Model&rdquo;.
        </p>

        <div className="grid-2">
          <Field label="Price (USD)" htmlFor="price">
            <Input
              id="price"
              type="text"
              inputMode="decimal"
              name="price"
              required
              pattern="^\d+(\.\d{1,2})?$"
              defaultValue={defaults.price_dollars ?? ""}
            />
          </Field>
          <Field label="Postal code / location" htmlFor="location_postal">
            <Input
              id="location_postal"
              name="location_postal"
              required
              maxLength={64}
              defaultValue={defaults.location_postal ?? ""}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <Textarea
            id="description"
            name="description"
            rows={5}
            maxLength={5000}
            defaultValue={defaults.description ?? ""}
          />
        </Field>

        <label className="check-row">
          <input
            type="checkbox"
            name="offers_enabled"
            defaultChecked={!!defaults.offers_enabled}
          />
          <span>
            Open to offers — buyers can propose a different price
          </span>
        </label>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Build</h2>
        <p className="card-sub">All optional — but each one helps buyers filter.</p>

        <div className="grid-2">
          <Field label="Frame size" htmlFor="frame_size" help="e.g. M, 17.5″, 52cm.">
            <Input
              id="frame_size"
              name="frame_size"
              maxLength={32}
              defaultValue={defaults.frame_size ?? ""}
            />
          </Field>
          <Field label="Frame style" htmlFor="frame_style_id">
            <Select
              name="frame_style_id"
              options={refs.frameStyles}
              defaultValue={defaults.frame_style_id}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Frame material" htmlFor="frame_material_id">
            <Select
              name="frame_material_id"
              options={refs.frameMaterials}
              defaultValue={defaults.frame_material_id}
            />
          </Field>
          <Field label="Gender fit" htmlFor="gender_fit_id">
            <Select
              name="gender_fit_id"
              options={refs.genderFits}
              defaultValue={defaults.gender_fit_id}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Wheel size" htmlFor="wheel_size_id">
            <Select
              name="wheel_size_id"
              options={refs.wheelSizes}
              defaultValue={defaults.wheel_size_id}
            />
          </Field>
          <Field label="Suspension" htmlFor="suspension_type_id">
            <Select
              name="suspension_type_id"
              options={refs.suspensionTypes}
              defaultValue={defaults.suspension_type_id}
            />
          </Field>
        </div>

        <Field label="Brakes" htmlFor="brake_type_id">
          <Select
            name="brake_type_id"
            options={refs.brakeTypes}
            defaultValue={defaults.brake_type_id}
          />
        </Field>
      </section>

      <section className="form-card">
        <h2 className="card-heading">Drivetrain & motor</h2>
        <p className="card-sub">The ebike-specific stuff buyers most often filter by.</p>

        <div className="grid-2">
          <Field label="Motor brand" htmlFor="motor_brand_id">
            <Select
              name="motor_brand_id"
              options={refs.motorBrands}
              defaultValue={defaults.motor_brand_id}
            />
          </Field>
          <Field label="Motor type" htmlFor="motor_type_id">
            <Select
              name="motor_type_id"
              options={refs.motorTypes}
              defaultValue={defaults.motor_type_id}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Motor watts (nominal)" htmlFor="motor_watts_nominal">
            <Input
              id="motor_watts_nominal"
              name="motor_watts_nominal"
              type="number"
              min={50}
              max={3000}
              defaultValue={nullishStr(defaults.motor_watts_nominal)}
            />
          </Field>
          <Field label="Battery (Wh)" htmlFor="battery_wh">
            <Input
              id="battery_wh"
              name="battery_wh"
              type="number"
              min={50}
              max={5000}
              defaultValue={nullishStr(defaults.battery_wh)}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Top speed (km/h)" htmlFor="top_speed_mph">
            <Input
              id="top_speed_mph"
              name="top_speed_mph"
              type="number"
              min={0}
              max={100}
              defaultValue={nullishStr(defaults.top_speed_mph)}
            />
          </Field>
          <Field label="Drive mode" htmlFor="drive_mode_id">
            <Select
              name="drive_mode_id"
              options={refs.driveModes}
              defaultValue={defaults.drive_mode_id}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Range — min (km)" htmlFor="range_miles_min">
            <Input
              id="range_miles_min"
              name="range_miles_min"
              type="number"
              min={0}
              max={600}
              defaultValue={nullishStr(defaults.range_miles_min)}
            />
          </Field>
          <Field label="Range — max (km)" htmlFor="range_miles_max">
            <Input
              id="range_miles_max"
              name="range_miles_max"
              type="number"
              min={0}
              max={600}
              defaultValue={nullishStr(defaults.range_miles_max)}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Mileage on the bike (km)" htmlFor="mileage">
            <Input
              id="mileage"
              name="mileage"
              type="number"
              min={0}
              max={160000}
              defaultValue={nullishStr(defaults.mileage)}
            />
          </Field>
          <Field label="Color" htmlFor="color">
            <Input
              id="color"
              name="color"
              maxLength={32}
              defaultValue={defaults.color ?? ""}
            />
          </Field>
        </div>
      </section>

      <details className="form-card form-card--collapse">
        <summary className="card-heading">Optional details</summary>
        <p className="card-sub">Spec-sheet completeness for serious buyers.</p>

        <div className="grid-2">
          <Field label="Motor torque (Nm)" htmlFor="motor_torque_nm">
            <Input
              id="motor_torque_nm"
              name="motor_torque_nm"
              type="number"
              min={0}
              max={300}
              defaultValue={nullishStr(defaults.motor_torque_nm)}
            />
          </Field>
          <Field label="Motor watts (peak)" htmlFor="motor_watts_peak">
            <Input
              id="motor_watts_peak"
              name="motor_watts_peak"
              type="number"
              min={0}
              max={5000}
              defaultValue={nullishStr(defaults.motor_watts_peak)}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Battery voltage (V)" htmlFor="battery_voltage">
            <Input
              id="battery_voltage"
              name="battery_voltage"
              type="number"
              min={0}
              max={120}
              defaultValue={nullishStr(defaults.battery_voltage)}
            />
          </Field>
          <Field label="Battery (Ah)" htmlFor="battery_amp_hours">
            <Input
              id="battery_amp_hours"
              name="battery_amp_hours"
              type="number"
              step="0.1"
              min={0}
              max={50}
              defaultValue={nullishStr(defaults.battery_amp_hours)}
            />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="Charge time (hours)" htmlFor="charge_time_hours">
            <Input
              id="charge_time_hours"
              name="charge_time_hours"
              type="number"
              step="0.1"
              min={0}
              max={24}
              defaultValue={nullishStr(defaults.charge_time_hours)}
            />
          </Field>
          <Field label="Weight (kg)" htmlFor="weight_lbs">
            <Input
              id="weight_lbs"
              name="weight_lbs"
              type="number"
              step="0.1"
              min={0}
              max={250}
              defaultValue={nullishStr(defaults.weight_lbs)}
            />
          </Field>
        </div>

        <Field label="Display type" htmlFor="display_type">
          <Input
            id="display_type"
            name="display_type"
            maxLength={64}
            defaultValue={defaults.display_type ?? ""}
          />
        </Field>

        <Field
          label="Drivetrain"
          htmlFor="drivetrain"
          help="e.g. Shimano Deore 10-speed."
        >
          <Input
            id="drivetrain"
            name="drivetrain"
            maxLength={120}
            defaultValue={defaults.drivetrain ?? ""}
          />
        </Field>

        <Field label="Body position" htmlFor="body_position_id">
          <Select
            name="body_position_id"
            options={refs.bodyPositions}
            defaultValue={defaults.body_position_id}
          />
        </Field>

        <Field label="Accessories" htmlFor="accessories">
          <Textarea
            id="accessories"
            name="accessories"
            rows={3}
            maxLength={2000}
            defaultValue={defaults.accessories ?? ""}
          />
        </Field>

        <Field label="Modifications" htmlFor="modifications">
          <Textarea
            id="modifications"
            name="modifications"
            rows={3}
            maxLength={2000}
            defaultValue={defaults.modifications ?? ""}
          />
        </Field>

        <div className="grid-2">
          <label className="check-row">
            <input
              type="checkbox"
              name="has_warranty"
              defaultChecked={!!defaults.has_warranty}
            />
            <span>Has remaining warranty</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              name="has_original_receipt"
              defaultChecked={!!defaults.has_original_receipt}
            />
            <span>Has original receipt</span>
          </label>
        </div>

        <Field label="Warranty notes" htmlFor="warranty_text">
          <Input
            id="warranty_text"
            name="warranty_text"
            maxLength={500}
            defaultValue={defaults.warranty_text ?? ""}
          />
        </Field>
      </details>

      {showPhotos && (
        <section className="form-card">
          <h2 className="card-heading">Photos</h2>
          <p className="card-sub">
            Up to 10 · JPEG, PNG, WebP · 5 MB each. The first one becomes the
            default.
          </p>
          <Field label="Add photos" htmlFor="images">
            <input
              id="images"
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="file-input"
            />
          </Field>
        </section>
      )}

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      <div
        style={{
          display: "flex",
          gap: "var(--s-3)",
          justifyContent: "flex-end",
        }}
      >
        <Button type="submit" variant="primary" iconRight="arrow">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

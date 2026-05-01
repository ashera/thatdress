import { loadListingRefOptions } from "@/lib/ref-data";
import { saveDraftBuild } from "@/lib/actions/listing-wizard";
import { Field, Input } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
  type DraftRow,
} from "../_wizard";
import type { RefOption } from "@/lib/ref-data";

export const dynamic = "force-dynamic";

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

function nstr(v: number | string | null | undefined): string {
  if (v == null) return "";
  return String(v);
}

export default async function WizardBuildPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? STEP_ERRORS[error] ?? null : null;

  const [{ draft }, refs] = await Promise.all([
    loadDraft(id, "build"),
    loadListingRefOptions(),
  ]);

  const d: DraftRow = draft;

  return (
    <WizardShell step="build" draftId={draft.id} errorMessage={errorMessage}>
      <WizardHero
        icon="bolt"
        headline="The hardware that sells"
        body="Buyers filter by motor, battery, class, and brakes. Every field you fill in here is another way your bike shows up in their results — so it pays to be specific."
      />

      <form
        action={saveDraftBuild}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">Class &amp; category</h2>
          <p className="card-sub">Required to continue.</p>

          <div className="grid-2">
            <Field label="Class" htmlFor="bike_class_id">
              <Select
                name="bike_class_id"
                options={refs.classes}
                defaultValue={d.bike_class_id}
                required
              />
            </Field>
            <Field label="Category" htmlFor="bike_category_id">
              <Select
                name="bike_category_id"
                options={refs.categories}
                defaultValue={d.bike_category_id}
                required
              />
            </Field>
          </div>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Frame &amp; wheels</h2>
          <p className="card-sub">All optional.</p>

          <div className="grid-2">
            <Field label="Frame size" htmlFor="frame_size" help="e.g. M, 17.5″, 52cm.">
              <Input
                id="frame_size"
                name="frame_size"
                maxLength={32}
                defaultValue={d.frame_size ?? ""}
              />
            </Field>
            <Field label="Frame style" htmlFor="frame_style_id">
              <Select
                name="frame_style_id"
                options={refs.frameStyles}
                defaultValue={d.frame_style_id}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Frame material" htmlFor="frame_material_id">
              <Select
                name="frame_material_id"
                options={refs.frameMaterials}
                defaultValue={d.frame_material_id}
              />
            </Field>
            <Field label="Gender fit" htmlFor="gender_fit_id">
              <Select
                name="gender_fit_id"
                options={refs.genderFits}
                defaultValue={d.gender_fit_id}
              />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Wheel size" htmlFor="wheel_size_id">
              <Select
                name="wheel_size_id"
                options={refs.wheelSizes}
                defaultValue={d.wheel_size_id}
              />
            </Field>
            <Field label="Suspension" htmlFor="suspension_type_id">
              <Select
                name="suspension_type_id"
                options={refs.suspensionTypes}
                defaultValue={d.suspension_type_id}
              />
            </Field>
          </div>

          <Field label="Brakes" htmlFor="brake_type_id">
            <Select
              name="brake_type_id"
              options={refs.brakeTypes}
              defaultValue={d.brake_type_id}
            />
          </Field>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Motor &amp; battery</h2>
          <p className="card-sub">All optional, but buyers filter on these.</p>
          <WizardTip>
            Spec sheet not handy? Pop the battery — most have a sticker
            with Wh, voltage, and amp hours. Five minutes here saves you a
            week of &ldquo;what&rsquo;s the range?&rdquo; messages later.
          </WizardTip>

          <div className="grid-2">
            <Field label="Motor brand" htmlFor="motor_brand_id">
              <Select
                name="motor_brand_id"
                options={refs.motorBrands}
                defaultValue={d.motor_brand_id}
              />
            </Field>
            <Field label="Motor type" htmlFor="motor_type_id">
              <Select
                name="motor_type_id"
                options={refs.motorTypes}
                defaultValue={d.motor_type_id}
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
                defaultValue={nstr(d.motor_watts_nominal)}
              />
            </Field>
            <Field label="Battery (Wh)" htmlFor="battery_wh">
              <Input
                id="battery_wh"
                name="battery_wh"
                type="number"
                min={50}
                max={5000}
                defaultValue={nstr(d.battery_wh)}
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
                defaultValue={nstr(d.top_speed_mph)}
              />
            </Field>
            <Field label="Drive mode" htmlFor="drive_mode_id">
              <Select
                name="drive_mode_id"
                options={refs.driveModes}
                defaultValue={d.drive_mode_id}
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
                defaultValue={nstr(d.range_miles_min)}
              />
            </Field>
            <Field label="Range — max (km)" htmlFor="range_miles_max">
              <Input
                id="range_miles_max"
                name="range_miles_max"
                type="number"
                min={0}
                max={600}
                defaultValue={nstr(d.range_miles_max)}
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
                defaultValue={nstr(d.mileage)}
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
                defaultValue={d.weight_lbs ?? ""}
              />
            </Field>
          </div>

          <Field label="Color" htmlFor="color">
            <Input
              id="color"
              name="color"
              maxLength={32}
              defaultValue={d.color ?? ""}
            />
          </Field>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/photos`} />
      </form>
    </WizardShell>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listAllRegions } from "@/lib/regions";
import { createRegion, updateRegion } from "@/lib/actions/regions";
import { Button, Field, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "missing-label": "A label is required.",
  "missing-slug": "Slug couldn't be derived from that label.",
};

export default async function AdminRegionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const regions = await listAllRegions();
  const active = regions.filter((r) => r.is_active).length;

  return (
    <div className="page admin-page">
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Regions</p>
        <h1>Manage regions</h1>
        <p className="sub">
          {active} active · {regions.length} total. The site is exclusive to
          active regions — anyone outside them is shown the picker.
        </p>
      </header>

      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMessage}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
        <h2 className="card-heading">Add a region</h2>
        <form
          action={createRegion}
          style={{
            display: "grid",
            gap: "var(--s-3)",
          }}
        >
          <div className="grid-2">
            <Field
              label="Label"
              htmlFor="label"
              help="Full display name (used in picker, topbar)."
            >
              <Input id="label" name="label" required placeholder="Austin Metro, TX" />
            </Field>
            <Field
              label="Short name"
              htmlFor="short_name"
              help='Used in prose like "The {Austin Metro} formal-dress marketplace". Strips state/country.'
            >
              <Input id="short_name" name="short_name" placeholder="Austin Metro" />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Slug" htmlFor="slug" help="Optional, auto-derived if blank.">
              <Input id="slug" name="slug" placeholder="auto" />
            </Field>
            <div />
          </div>
          <Field
            label="Match patterns"
            htmlFor="match_pattern"
            help="Comma-separated. Each pattern is a case-insensitive substring of the IP-derived 'City, ST' string."
          >
            <Input
              id="match_pattern"
              name="match_pattern"
              placeholder="Austin, Round Rock, Pflugerville"
            />
          </Field>
          <div className="grid-2">
            <Field label="Sort" htmlFor="sort_order">
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                defaultValue={0}
              />
            </Field>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Add region
              </Button>
            </div>
          </div>
        </form>
      </section>

      {regions.length === 0 ? (
        <div className="empty-state">
          <h3>No regions yet</h3>
          <p style={{ margin: 0 }}>
            Add one above. Without an active region, every non-admin visitor
            will see the picker with no options.
          </p>
        </div>
      ) : (
        <div className="ref-table">
          <div className="ref-row region-row ref-head">
            <div>Label</div>
            <div>Short name</div>
            <div>Slug</div>
            <div>Match patterns</div>
            <div>Sort</div>
            <div>Active</div>
            <div></div>
          </div>
          {regions.map((r) => (
            <form
              key={r.id}
              action={updateRegion}
              className={`ref-row region-row ${r.is_active ? "" : "is-inactive"}`}
            >
              <input type="hidden" name="id" value={r.id} />
              <div>
                <Input
                  name="label"
                  defaultValue={r.label}
                  required
                  className="--square"
                />
              </div>
              <div>
                <Input
                  name="short_name"
                  defaultValue={r.short_name ?? ""}
                  className="--square"
                  placeholder="(uses label)"
                />
              </div>
              <div className="ref-slug">{r.slug}</div>
              <div>
                <Input
                  name="match_pattern"
                  defaultValue={r.match_pattern ?? ""}
                  className="--square"
                  placeholder="(none)"
                />
              </div>
              <div>
                <Input
                  name="sort_order"
                  type="number"
                  defaultValue={r.sort_order}
                  className="--square"
                />
              </div>
              <div>
                <label className="ref-toggle">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={r.is_active}
                  />
                  <span>{r.is_active ? "Active" : "Hidden"}</span>
                </label>
              </div>
              <div className="ref-actions">
                <Button type="submit" variant="ghost" size="sm">
                  Save
                </Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

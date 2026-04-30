import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { findRefTable, listRefRows } from "@/lib/ref-data";
import {
  createRefRow,
  editRefRow,
  removeRefRow,
} from "@/lib/actions/ref-data";
import { Button, Field, Input } from "../../../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "missing-display": "A name/label is required.",
};

export default async function ReferenceDataTablePage({
  params,
  searchParams,
}: {
  params: Promise<{ table: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();

  const { table: key } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const t = findRefTable(key);
  if (!t) notFound();

  const rows = await listRefRows(t);
  const fieldLabel = t.schema === "name" ? "Name" : "Label";

  return (
    <div className="page admin-page">
      <Link href="/admin/reference-data" className="back-link">
        ← All reference data
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Reference data</p>
        <h1>{t.label}</h1>
        <p className="sub">
          {rows.filter((r) => r.is_active).length} active · {rows.length} total
        </p>
      </header>

      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMessage}
        </p>
      )}

      <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
        <h2 className="card-heading">Add a {t.singular}</h2>
        <form
          action={createRefRow}
          style={{
            display: "grid",
            gridTemplateColumns: t.schema === "slug-label" ? "1fr 1fr 120px auto" : "1fr 120px auto",
            gap: "var(--s-3)",
            alignItems: "end",
          }}
        >
          <input type="hidden" name="tableKey" value={t.key} />
          <Field label={fieldLabel} htmlFor="display">
            <Input id="display" name="display" required />
          </Field>
          {t.schema === "slug-label" && (
            <Field
              label="Slug"
              htmlFor="slug"
              help="Optional. Auto-derived from label if blank."
            >
              <Input id="slug" name="slug" placeholder="auto" />
            </Field>
          )}
          <Field label="Sort" htmlFor="sort_order">
            <Input id="sort_order" name="sort_order" type="number" defaultValue={0} />
          </Field>
          <Button type="submit" variant="primary">
            Add
          </Button>
        </form>
      </section>

      {rows.length === 0 ? (
        <div className="empty-state">
          <h3>No values yet</h3>
          <p style={{ margin: 0 }}>Add the first one above.</p>
        </div>
      ) : (
        <div className="ref-table">
          <div className="ref-row ref-head">
            <div>{fieldLabel}</div>
            {t.schema === "slug-label" && <div>Slug</div>}
            <div>Sort</div>
            <div>Active</div>
            <div>In use</div>
            <div></div>
          </div>
          {rows.map((r) => (
            <form
              key={r.id}
              action={editRefRow}
              className={`ref-row ${r.is_active ? "" : "is-inactive"}`}
            >
              <input type="hidden" name="tableKey" value={t.key} />
              <input type="hidden" name="id" value={r.id} />
              <div>
                <Input
                  name="display"
                  defaultValue={r.display}
                  required
                  className="--square"
                />
              </div>
              {t.schema === "slug-label" && (
                <div className="ref-slug">{r.slug}</div>
              )}
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
              <div className="ref-inuse">
                {r.in_use === 0 ? (
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                ) : (
                  <span>{r.in_use}</span>
                )}
              </div>
              <div className="ref-actions">
                <Button type="submit" variant="ghost" size="sm">
                  Save
                </Button>
                <DeleteForm id={r.id} tableKey={t.key} />
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteForm({ id, tableKey }: { id: string; tableKey: string }) {
  return (
    <form action={removeRefRow} style={{ display: "inline" }}>
      <input type="hidden" name="tableKey" value={tableKey} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" title="Delete">
        ✕
      </Button>
    </form>
  );
}

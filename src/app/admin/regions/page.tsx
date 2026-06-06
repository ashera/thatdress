import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listRegionsWithDetail, type RegionListRow } from "@/lib/admin-regions";
import { createRegion } from "@/lib/actions/regions";
import { Badge, Button, Field, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Regions — Admin" };

const ERRORS: Record<string, string> = {
  "missing-label": "A label is required.",
  "missing-slug": "Slug couldn't be derived from that label.",
};

function fmtAud(cents: number | null): string {
  if (cents == null || cents <= 0) return "Free";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function assignmentBadge(r: RegionListRow) {
  if (!r.assigned) return <Badge variant="warn">Unassigned</Badge>;
  if (r.in_free) return <Badge variant="info">Partner · free trial</Badge>;
  return <Badge variant="ok">Partner · fee active</Badge>;
}

const cellHead: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--s-2) var(--s-3)",
  fontSize: 12,
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  padding: "var(--s-2) var(--s-3)",
  fontSize: "var(--t-body-s)",
  borderBottom: "1px solid var(--hairline)",
  verticalAlign: "top",
};
const filterField: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  color: "var(--ink-3)",
};

const SORT_KEYS = [
  "region",
  "visibility",
  "partner",
  "fee",
  "active",
  "pending",
  "sort",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

function sortValue(r: RegionListRow, key: SortKey): string | number {
  switch (key) {
    case "region":
      return r.label.toLowerCase();
    case "visibility":
      return r.is_active ? 1 : 0;
    case "partner":
      return r.assigned ? 1 : 0;
    case "fee":
      return r.listing_fee_cents ?? -1;
    case "active":
      return r.active_listings;
    case "pending":
      return r.pending_apps;
    default:
      return r.sort_order;
  }
}

export default async function AdminRegionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    vis?: string;
    assign?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAdmin();
  const { error, vis, assign, sort, dir } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(sort ?? "")
    ? (sort as SortKey)
    : "sort";
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";

  const all = await listRegionsWithDetail();
  const rows = all
    .filter((r) => {
      if (vis === "active" && !r.is_active) return false;
      if (vis === "hidden" && r.is_active) return false;
      if (assign === "assigned" && !r.assigned) return false;
      if (assign === "unassigned" && r.assigned) return false;
      return true;
    })
    .sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : va < vb
            ? -1
            : va > vb
              ? 1
              : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });

  // Build a sortable column header link, preserving the active filters and
  // toggling direction when re-clicking the current column.
  const headerHref = (col: SortKey): string => {
    const params = new URLSearchParams();
    if (vis) params.set("vis", vis);
    if (assign) params.set("assign", assign);
    params.set("sort", col);
    params.set("dir", sortKey === col && sortDir === "asc" ? "desc" : "asc");
    return `/admin/regions?${params.toString()}`;
  };
  const arrow = (col: SortKey): string =>
    sortKey === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const activeCount = all.filter((r) => r.is_active).length;
  const assignedCount = all.filter((r) => r.assigned).length;
  const filtersActive = !!vis || !!assign;

  return (
    <div className="page admin-page" style={{ maxWidth: 1280 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Regions</p>
        <h1>Manage regions</h1>
        <p className="sub">
          {activeCount} active · {assignedCount} with a partner · {all.length}{" "}
          total. The site is exclusive to active regions — anyone outside them
          sees the picker.
        </p>
      </header>

      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          {errorMessage}
        </p>
      )}

      {/* Add a region */}
      <section className="form-card" style={{ marginBottom: "var(--s-6)" }}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Add a region
        </h2>
        <form action={createRegion} style={{ display: "grid", gap: "var(--s-3)" }}>
          <div className="grid-2">
            <Field label="Label" htmlFor="label" help="Full display name.">
              <Input id="label" name="label" required placeholder="Austin Metro, TX" />
            </Field>
            <Field
              label="Short name"
              htmlFor="short_name"
              help='Used in prose like "The {Austin Metro} marketplace".'
            >
              <Input id="short_name" name="short_name" placeholder="Austin Metro" />
            </Field>
          </div>
          <Field
            label="Match patterns"
            htmlFor="match_pattern"
            help="Comma-separated case-insensitive substrings of the IP-derived 'City, ST'."
          >
            <Input
              id="match_pattern"
              name="match_pattern"
              placeholder="Austin, Round Rock, Pflugerville"
            />
          </Field>
          <div className="grid-2">
            <Field label="Sort" htmlFor="sort_order">
              <Input id="sort_order" name="sort_order" type="number" defaultValue={0} />
            </Field>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Add region
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* Filters */}
      <form
        method="get"
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "var(--s-3)",
          alignItems: "flex-end",
          marginBottom: "var(--s-4)",
          flexWrap: "wrap",
        }}
      >
        <label style={filterField}>
          Visibility
          <select name="vis" defaultValue={vis ?? "all"} className="input">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
        <label style={filterField}>
          Partner
          <select name="assign" defaultValue={assign ?? "all"} className="input">
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <Button type="submit" variant="dark" size="sm">
          Filter
        </Button>
        {filtersActive && (
          <Link
            href="/admin/regions"
            style={{ fontSize: "var(--t-body-s)", color: "var(--ink-3)", alignSelf: "center" }}
          >
            Clear
          </Link>
        )}
      </form>

      {/* Regions table */}
      <section className="form-card">
        {rows.length === 0 ? (
          <p className="card-sub" style={{ margin: 0 }}>
            {all.length === 0
              ? "No regions yet — add one above."
              : "No regions match these filters."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  {(
                    [
                      ["region", "Region"],
                      ["visibility", "Visibility"],
                      ["partner", "Partner"],
                      ["fee", "Listing fee"],
                      ["active", "Active"],
                      ["pending", "Applications"],
                      ["sort", "Sort"],
                    ] as Array<[SortKey, string]>
                  ).map(([col, label]) => (
                    <th key={col} style={cellHead}>
                      <Link
                        href={headerHref(col)}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {label}
                        {arrow(col)}
                      </Link>
                    </th>
                  ))}
                  <th style={cellHead}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={cell}>
                      <Link
                        href={`/admin/regions/${r.id}`}
                        style={{ color: "var(--ink-1)", fontWeight: 600 }}
                      >
                        {r.label}
                      </Link>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--ink-4)",
                        }}
                      >
                        {r.slug}
                      </div>
                    </td>
                    <td style={cell}>
                      {r.is_active ? (
                        <Badge variant="ok">Active</Badge>
                      ) : (
                        <Badge variant="ink">Hidden</Badge>
                      )}
                    </td>
                    <td style={cell}>
                      {assignmentBadge(r)}
                      {r.partner_email && (
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                          {r.partner_email}
                        </div>
                      )}
                    </td>
                    <td style={cell}>{r.assigned ? fmtAud(r.listing_fee_cents) : "—"}</td>
                    <td style={cell}>{r.active_listings}</td>
                    <td style={cell}>
                      {r.pending_apps > 0 ? (
                        <Badge variant="warn">{r.pending_apps} pending</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={cell}>{r.sort_order}</td>
                    <td style={cell}>
                      <Link
                        href={`/admin/regions/${r.id}`}
                        style={{ color: "var(--volt-700)", fontWeight: 600 }}
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

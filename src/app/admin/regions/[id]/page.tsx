import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getRegionDetail } from "@/lib/admin-regions";
import { updateRegion, deleteRegion } from "@/lib/actions/regions";
import {
  setRegionPartner,
  unassignRegionPartner,
} from "@/lib/actions/admin-regions";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/actions/admin-partner-applications";
import {
  createPartnerSandbox,
  endPartnerSandbox,
} from "@/lib/actions/admin-sandbox";
import { getSandboxRegionForUser } from "@/lib/regions";
import { showSamplesFromParam } from "@/lib/admin-test-data";
import { Badge, Button, Field, Input } from "../../../_components/ui";
import { DeleteConfirmDialog } from "../../../_components/delete-confirm-dialog";
import { SampleDataToggle } from "../../_components/sample-data-toggle";

export const dynamic = "force-dynamic";

const DONE: Record<string, string> = {
  assigned: "Partner assigned — a fresh 12-month free window has started.",
  unassigned: "Partner removed from this region.",
  approved: "Application approved — partner activated.",
  rejected: "Application rejected.",
  saved: "Region saved.",
  "sandbox-created":
    "Sandbox created — the partner can launch it from their dashboard.",
  "sandbox-ended": "Partner sandbox torn down.",
};
const ERR: Record<string, string> = {
  email: "Enter the partner's email.",
  "user-not-found": "No account found with that email.",
  assign: "Couldn't assign the partner — please try again.",
  "already-assigned":
    "This region already has a partner. Unassign them first, then assign someone new.",
  "already-partner":
    "That account already runs a region. Partners manage a single region for now.",
  taken: "That region was already taken by another partner.",
  approve: "Couldn't approve — the application may already be decided.",
  "sandbox-exists": "That partner already has a sandbox.",
  "sandbox-failed": "Couldn't update the sandbox — please try again.",
};

function fmtAud(cents: number): string {
  if (cents <= 0) return "Free";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function freeNote(freeUntil: string | null, pct: number): string {
  if (!freeUntil) return "";
  const end = new Date(freeUntil).getTime();
  const now = Date.now();
  if (end > now) {
    const days = Math.ceil((end - now) / 86_400_000);
    return `Free until ${fmtDate(freeUntil)} (${days} days left), then a ${pct}% platform fee.`;
  }
  return `Free period ended ${fmtDate(freeUntil)} — ${pct}% platform fee applies.`;
}

const cardStyle: React.CSSProperties = { marginBottom: "var(--s-5)" };

export default async function RegionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string; samples?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { done, error, samples } = await searchParams;
  const showSamples = showSamplesFromParam(samples);
  const detail = await getRegionDetail(id, showSamples);
  if (!detail) notFound();
  const { config: c, partner, stats, listings, pendingApplications } = detail!;
  const from = `/admin/regions/${id}`;
  // The assigned partner's private sandbox (if the admin has set one up).
  const partnerSandbox = partner
    ? await getSandboxRegionForUser(partner.user_id)
    : null;

  return (
    <div className="page page--pad" style={{ maxWidth: 1000 }}>
      <Link href="/admin/regions" className="back-link">
        ← Manage regions
      </Link>

      <header style={{ margin: "var(--s-3) 0 var(--s-5)" }}>
        <p className="eyebrow">Admin · Region</p>
        <h1
          style={{
            marginBottom: 4,
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1, 44px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            color: "var(--ink-1)",
          }}
        >
          {c.label}
        </h1>
        <p className="sub" style={{ margin: 0 }}>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{c.slug}</code>{" "}
          ·{" "}
          {c.is_active ? (
            <Badge variant="ok">Active</Badge>
          ) : (
            <Badge variant="ink">Hidden</Badge>
          )}
        </p>
      </header>

      {done && DONE[done] && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          {DONE[done]}
        </p>
      )}
      {error && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {ERR[error] ?? "Something went wrong."}
        </p>
      )}

      {/* Partner */}
      <section className="form-card" style={cardStyle}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Partner
        </h2>
        {partner ? (
          <>
            <p className="card-sub" style={{ marginTop: 0 }}>
              Run by <strong style={{ color: "var(--ink-1)" }}>{partner.email}</strong>
              {partner.name ? ` (${partner.name})` : ""} since{" "}
              {fmtDate(partner.activated_at)}. Listing fee:{" "}
              <strong>{fmtAud(partner.listing_fee_cents)}</strong>.
              <br />
              {freeNote(partner.free_until, partner.platform_fee_pct)}
            </p>
            <div
              style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}
            >
              <form action={unassignRegionPartner}>
                <input type="hidden" name="region_id" value={c.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Unassign
                </Button>
              </form>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                To hand this region to someone else, unassign first — then
                assign or approve a new application.
              </span>
            </div>

            {/* Partner sandbox: a private test region this partner can
                launch from their dashboard to trial the tools. */}
            <div
              style={{
                marginTop: "var(--s-4)",
                paddingTop: "var(--s-4)",
                borderTop: "1px solid var(--hairline)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-2)",
                  marginBottom: 4,
                }}
              >
                <h3 className="card-sub" style={{ margin: 0, fontWeight: 600, color: "var(--ink-1)" }}>
                  Partner sandbox
                </h3>
                <Badge variant="info">Test region</Badge>
                {partnerSandbox && <Badge variant="ok">Active</Badge>}
              </div>
              {partnerSandbox ? (
                <div
                  style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                    {partner.email} can launch it from their partner dashboard.
                  </span>
                  <form action={endPartnerSandbox}>
                    <input type="hidden" name="region_id" value={partnerSandbox.id} />
                    <input type="hidden" name="from" value={from} />
                    <Button type="submit" variant="ghost" size="sm">
                      Tear down sandbox
                    </Button>
                  </form>
                </div>
              ) : (
                <div
                  style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap", alignItems: "center" }}
                >
                  <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
                    Spin up a private, seeded test region so this partner can
                    trial the marketplace end to end.
                  </span>
                  <form action={createPartnerSandbox}>
                    <input type="hidden" name="user_id" value={partner.user_id} />
                    <input type="hidden" name="from" value={from} />
                    <Button type="submit" variant="primary" size="sm" iconRight="arrow">
                      Create sandbox for this partner
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="card-sub" style={{ marginTop: 0 }}>
              No partner runs this region yet.
            </p>
            <form
              action={setRegionPartner}
              style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-end", maxWidth: 520 }}
            >
              <input type="hidden" name="region_id" value={c.id} />
              <label style={{ flex: 1, fontSize: 12, color: "var(--ink-3)" }}>
                Assign to (email)
                <Input name="email" type="email" placeholder="partner@example.com" required />
              </label>
              <Button type="submit" variant="primary" size="sm">
                Assign partner
              </Button>
            </form>
          </>
        )}
      </section>

      {/* Pending applications for this region */}
      {pendingApplications.length > 0 && (
        <section className="form-card" style={cardStyle}>
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Pending applications ({pendingApplications.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {pendingApplications.map((a) => (
              <div
                key={a.id}
                style={{
                  borderBottom: "1px solid var(--hairline)",
                  paddingBottom: "var(--s-3)",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>{a.user_email}</div>
                {a.business_name && (
                  <div style={{ fontSize: 13 }}>
                    <strong>Business:</strong> {a.business_name}
                  </div>
                )}
                {a.pitch && (
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{a.pitch}</div>
                )}
                <div
                  style={{ display: "flex", gap: "var(--s-2)", marginTop: "var(--s-2)", alignItems: "flex-end", flexWrap: "wrap" }}
                >
                  <form action={approveApplication}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="from" value={from} />
                    <Button type="submit" variant="primary" size="sm" disabled={!!partner}>
                      Approve &amp; activate
                    </Button>
                  </form>
                  <form action={rejectApplication} style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="from" value={from} />
                    <Input name="note" placeholder="Reason (optional)" maxLength={500} />
                    <Button type="submit" variant="ghost" size="sm">
                      Reject
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          {partner && (
            <p className="card-sub" style={{ marginTop: "var(--s-3)" }}>
              This region already has a partner — unassign them before approving
              another application.
            </p>
          )}
        </section>
      )}

      {/* Activity */}
      <section className="form-card" style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "var(--s-3)",
            flexWrap: "wrap",
            marginBottom: "var(--s-3)",
          }}
        >
          <h2 className="card-heading" style={{ margin: 0 }}>
            Activity
          </h2>
          <SampleDataToggle show={showSamples} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "var(--s-3)",
          }}
        >
          {[
            { k: "Active listings", v: String(stats.active) },
            { k: "Sold", v: String(stats.sold) },
            { k: "GMV", v: fmtAud(stats.gmv_cents) },
            { k: "Sellers", v: String(stats.sellers) },
          ].map((t) => (
            <div
              key={t.k}
              style={{
                padding: "var(--s-3)",
                borderRadius: 10,
                background: "var(--surface-sunken)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{t.k}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-1)" }}>
                {t.v}
              </div>
            </div>
          ))}
        </div>
        {listings.length > 0 && (
          <div style={{ marginTop: "var(--s-4)" }}>
            <h3 className="card-sub" style={{ margin: "0 0 var(--s-2)", fontWeight: 600 }}>
              Recent listings
            </h3>
            <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
              {listings.map((l) => (
                <Link
                  key={l.id}
                  href={`/listings/${l.id}`}
                  style={{ width: 92, textDecoration: "none", color: "inherit" }}
                >
                  {l.primary_image_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/listings/${l.id}/images/${l.primary_image_id}?w=200`}
                      alt=""
                      style={{ width: 92, height: 120, objectFit: "cover", borderRadius: 6, display: "block" }}
                    />
                  ) : (
                    <div style={{ width: 92, height: 120, borderRadius: 6, background: "var(--surface-sunken)" }} />
                  )}
                  <div style={{ fontSize: 11, marginTop: 4, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[l.designer_name, l.model].filter(Boolean).join(" ") || l.title || `#${l.id}`}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
                    {l.sold_at ? "Sold" : l.is_published ? "Live" : "Hidden"} · {fmtAud(l.price_cents)}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Configuration */}
      <section className="form-card" style={cardStyle}>
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          Configuration
        </h2>
        <form action={updateRegion} style={{ display: "grid", gap: "var(--s-3)" }}>
          <input type="hidden" name="id" value={c.id} />
          <div className="grid-2">
            <Field label="Label" htmlFor="label">
              <Input id="label" name="label" defaultValue={c.label} required />
            </Field>
            <Field label="Short name" htmlFor="short_name">
              <Input id="short_name" name="short_name" defaultValue={c.short_name ?? ""} />
            </Field>
          </div>
          <Field label="Match patterns" htmlFor="match_pattern">
            <Input
              id="match_pattern"
              name="match_pattern"
              defaultValue={c.match_pattern ?? ""}
              placeholder="(none)"
            />
          </Field>
          <div className="grid-2">
            <Field label="Sort" htmlFor="sort_order">
              <Input id="sort_order" name="sort_order" type="number" defaultValue={c.sort_order} />
            </Field>
            <label className="check-row" style={{ alignItems: "center" }}>
              <input type="checkbox" name="is_active" defaultChecked={c.is_active} />
              <span>Active (visible to the public)</span>
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
            <Button type="submit" variant="primary">
              Save changes
            </Button>
          </div>
        </form>

        {/* Delete lives OUTSIDE the edit form — the dialog renders its own
            <form action={deleteRegion}>, and a nested <form> is invalid HTML
            (the inner submit never fires). */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            marginTop: "var(--s-4)",
            paddingTop: "var(--s-4)",
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <DeleteConfirmDialog
            deleteAction={deleteRegion}
            idName="id"
            idValue={c.id}
            title="Delete this region?"
            intro={`Permanently delete “${c.label}”.`}
            warnings={
              c.is_test
                ? [
                    "All sandbox sample sellers, their listings and dresses are deleted.",
                    "The partner grant is removed and the prospect is demoted.",
                  ]
                : [
                    "Any partner assignment and applications for this region are removed.",
                    "Listings keep their data but lose their region link.",
                  ]
            }
            triggerLabel="Delete region"
          />
        </div>
      </section>
    </div>
  );
}

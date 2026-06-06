import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getApplyRegions,
  getMyApplications,
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";
import { applyForRegion } from "@/lib/actions/partner-apply";
import { Badge, Button, Field, Input, Textarea } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply to partner — frockd" };

const ERRORS: Record<string, string> = {
  region: "Please choose a region.",
  unavailable: "That region isn't available anymore.",
  duplicate: "You already have a pending application for that region.",
};

function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="ok">Approved</Badge>;
  if (status === "rejected") return <Badge variant="warn">Not approved</Badge>;
  return <Badge variant="info">Pending review</Badge>;
}

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/partners/apply")}`);

  const { submitted, error } = await searchParams;
  const [regions, myApps] = await Promise.all([
    getApplyRegions(user.id),
    getMyApplications(user.id),
  ]);
  const available = regions.filter(
    (r) => !r.taken && !r.yours && !r.pendingByYou,
  );

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-sketch">
          <Image
            src="/dress-sketch-tr-back.png"
            alt="Illustration of a pre-loved formal dress on a hanger"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
          />
        </div>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Partner programme</p>
            <h1>
              Apply to run a <span className="accent">region.</span>
            </h1>
            <p className="sub">
              Pick a region and tell us a little about you. We review every
              application and activate your region once approved — your first{" "}
              {PARTNER_FREE_MONTHS} months are free.
            </p>
          </div>
        </div>
      </section>

      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "var(--s-7) 0 var(--s-9)",
        }}
      >
        {submitted && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Application received — we&rsquo;ll review it and be in touch. You can
          track its status below.
        </p>
      )}
      {error && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      )}

      {regions.length === 0 ? (
        <section className="form-card">
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            No active regions yet
          </h2>
          <p className="card-sub" style={{ margin: 0 }}>
            There are no live regions to apply for right now. Check back soon
            — or <Link href="/support">contact us</Link>.
          </p>
        </section>
      ) : (
        <section className="form-card">
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Your application
          </h2>
          <form
            action={applyForRegion}
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
          >
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend
                className="field-label"
                style={{ marginBottom: "var(--s-2)", padding: 0 }}
              >
                Choose a region
              </legend>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {regions.map((r) => {
                  const selectable = !r.taken && !r.yours && !r.pendingByYou;
                  const badge = r.yours ? (
                    <Badge variant="info">You run this</Badge>
                  ) : r.pendingByYou ? (
                    <Badge variant="info">Pending</Badge>
                  ) : r.taken ? (
                    <Badge variant="ink">Taken</Badge>
                  ) : (
                    <Badge variant="ok">Available</Badge>
                  );
                  return (
                    <label
                      key={r.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--hairline)",
                        background: selectable
                          ? "var(--surface)"
                          : "var(--surface-sunken)",
                        cursor: selectable ? "pointer" : "default",
                      }}
                    >
                      <input
                        type="radio"
                        name="region_id"
                        value={r.id}
                        disabled={!selectable}
                        required={selectable}
                      />
                      <span
                        style={{
                          fontWeight: 600,
                          color: selectable ? "var(--ink-1)" : "var(--ink-3)",
                        }}
                      >
                        {r.label}
                      </span>
                      <span style={{ marginLeft: "auto" }}>{badge}</span>
                    </label>
                  );
                })}
              </div>
              {available.length === 0 && (
                <p className="card-sub" style={{ marginTop: "var(--s-3)" }}>
                  Every active region is currently taken or already has your
                  application — check back soon.
                </p>
              )}
            </fieldset>

            <Field
              label="Business or trading name (optional)"
              htmlFor="business_name"
            >
              <Input id="business_name" name="business_name" maxLength={120} />
            </Field>

            <Field
              label="Why are you a good fit for this region?"
              htmlFor="pitch"
            >
              <Textarea id="pitch" name="pitch" rows={5} maxLength={2000} />
            </Field>

            <Field
              label="Expected inventory (optional)"
              htmlFor="expected_inventory"
              help="Roughly how many dresses / sellers you can bring on early."
            >
              <Input
                id="expected_inventory"
                name="expected_inventory"
                maxLength={500}
              />
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                type="submit"
                variant="primary"
                iconRight="arrow"
                disabled={available.length === 0}
              >
                Submit application
              </Button>
            </div>
          </form>
        </section>
      )}

      {myApps.length > 0 && (
        <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Your applications
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {myApps.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--s-3)",
                  alignItems: "center",
                  padding: "var(--s-3) 0",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>
                    {a.region_label}
                  </div>
                  {a.decision_note && (
                    <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                      {a.decision_note}
                    </div>
                  )}
                </div>
                {statusBadge(a.status)}
              </li>
            ))}
          </ul>
        </section>
      )}

        <p className="card-sub" style={{ marginTop: "var(--s-5)" }}>
          After your free year, a {PARTNER_PLATFORM_FEE_PCT}% platform fee
          applies to the listing fees you collect.{" "}
          <Link href="/partners">How it works →</Link>
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import {
  getApplyRegions,
  getMyApplications,
  PARTNER_FREE_MONTHS,
  PARTNER_PLATFORM_FEE_PCT,
} from "@/lib/partner-programme";
import {
  applyForRegion,
  createMySandbox,
  registerPartnerApplicant,
} from "@/lib/actions/partner-apply";
import { enterSandbox } from "@/lib/actions/regions";
import { getSandboxRegionForUser } from "@/lib/regions";
import { PASSWORD_RULES_SUMMARY } from "@/lib/password-rules";
import { Badge, Button, Field, Input, Textarea } from "../../_components/ui";
import { ApplicationTimeline } from "../../_components/application-timeline";
import { PasswordRules } from "../../_components/password-rules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply to partner — frockd" };

const ERRORS: Record<string, string> = {
  region: "Please choose a region.",
  unavailable: "That region isn't available anymore.",
  duplicate: "You already have a pending application for that region.",
  "pending-exists":
    "You already have an application under review — you can apply for another region once it's decided.",
  "invalid-email": "Please enter a valid email address.",
  "weak-password": PASSWORD_RULES_SUMMARY,
  "long-password": "Password must be 72 characters or fewer.",
  "email-taken": "An account with that email already exists. Log in instead.",
  "no-application": "Apply for a region first, then you can spin up a sandbox.",
  "sandbox-exists": "You already have a sandbox — jump back in below.",
  "sandbox-failed": "Couldn’t create your sandbox just now — please try again.",
};

/** Explains the sandbox and offers a one-click create (or enter, if they
 *  already have one). Shown to applicants after they've applied. */
function SandboxCard({ sandbox }: { sandbox: { id: string } | null }) {
  return (
    <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-2)",
          marginBottom: 4,
        }}
      >
        <h2 className="card-heading" style={{ margin: 0 }}>
          Try it in a sandbox
        </h2>
        <Badge variant="info">Test region</Badge>
      </div>
      <p className="card-sub" style={{ marginTop: 0 }}>
        A sandbox is your own private test region — a full copy of the partner
        experience that only you can see. Browse it as a buyer, list a dress as
        a seller, and explore the partner dashboard and listing-fee controls.
        Nothing in your sandbox is visible to the public and it doesn&rsquo;t
        affect your application — we&rsquo;ve even added a few sample listings to
        get you started. You can leave the sandbox any time from the banner at
        the top.
      </p>
      {sandbox ? (
        <form action={enterSandbox}>
          <input type="hidden" name="region_id" value={sandbox.id} />
          <input type="hidden" name="next" value="/listings" />
          <Button type="submit" variant="primary" iconRight="arrow">
            Enter your sandbox
          </Button>
        </form>
      ) : (
        <form action={createMySandbox}>
          <Button type="submit" variant="primary" iconRight="arrow">
            Create my sandbox
          </Button>
        </form>
      )}
    </section>
  );
}

function ApplyHero() {
  return (
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
  );
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge variant="ok">Approved</Badge>;
  if (status === "rejected") return <Badge variant="warn">Not approved</Badge>;
  return <Badge variant="info">Pending review</Badge>;
}

export default async function PartnerApplyPage({
  searchParams,
}: {
  searchParams: Promise<{
    submitted?: string;
    error?: string;
    registered?: string;
    sandbox?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const { submitted, error, registered, sandbox: sandboxFlag } =
    await searchParams;
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  // Anonymous prospects register inline here rather than detouring through
  // the standard login/register pages. Once they have an account they fall
  // through to the region chooser below.
  if (!user) {
    return <PartnerSignup errorMessage={errorMessage} />;
  }

  const [regions, myApps, sandbox] = await Promise.all([
    getApplyRegions(user.id),
    getMyApplications(user.id),
    getSandboxRegionForUser(user.id),
  ]);
  const available = regions.filter(
    (r) => !r.taken && !r.yours && !r.pendingByYou,
  );
  // A prospect may only have one application in flight at a time.
  const hasPending = myApps.some((a) => a.status === "pending");

  return (
    <div className="page">
      <ApplyHero />

      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "var(--s-7) 0 var(--s-9)",
        }}
      >
        {registered && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Account created — welcome! Choose the region you&rsquo;d like to run
          below.
        </p>
      )}
      {submitted && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Application received — we&rsquo;ll review it and be in touch. You can
          track its status below.
        </p>
      )}
      {sandboxFlag === "ready" && (
        <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
          Your sandbox is ready — jump in below to explore the partner tools.
        </p>
      )}
      {errorMessage && (
        <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
          {errorMessage}
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
      ) : hasPending ? (
        <section className="form-card">
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Application under review
          </h2>
          <p className="card-sub" style={{ margin: 0 }}>
            You can only have one application in progress at a time. We&rsquo;re
            reviewing your current application — once it&rsquo;s decided you can
            apply for another region. Track its progress below.
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

      {(hasPending || sandbox) && <SandboxCard sandbox={sandbox} />}

      {myApps.length > 0 && (
        <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Your applications
          </h2>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            {myApps.map((a) => (
              <li
                key={a.id}
                style={{
                  padding: "var(--s-4)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 12,
                  background: "var(--surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--s-3)",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--ink-1)" }}>
                    {a.region_label}
                  </div>
                  {statusBadge(a.status)}
                </div>

                <ApplicationTimeline status={a.status} />

                {a.decision_note && (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--ink-3)",
                      margin: "var(--s-3) 0 0",
                      paddingTop: "var(--s-3)",
                      borderTop: "1px solid var(--hairline)",
                    }}
                  >
                    <strong style={{ color: "var(--ink-2)" }}>
                      Note from our team:
                    </strong>{" "}
                    {a.decision_note}
                  </p>
                )}
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

/** Inline signup shown to anonymous visitors on /partners/apply. Captures
 *  name + contact + password, then drops them back here authenticated to
 *  choose a region. */
function PartnerSignup({ errorMessage }: { errorMessage: string | null }) {
  return (
    <div className="page">
      <ApplyHero />

      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "var(--s-7) 0 var(--s-9)",
        }}
      >
        <section className="form-card">
          <h2 className="card-heading" style={{ marginTop: 0 }}>
            Create your partner account
          </h2>
          <p className="card-sub" style={{ marginTop: 0 }}>
            A few details to get you started — then you&rsquo;ll pick the
            region you want to run. Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent("/partners/apply")}`}>
              Log in
            </Link>
            .
          </p>

          {errorMessage && (
            <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
              {errorMessage}
            </p>
          )}

          <form
            action={registerPartnerApplicant}
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
          >
            <div className="grid-2">
              <Field label="First name" htmlFor="first_name">
                <Input
                  id="first_name"
                  name="first_name"
                  required
                  maxLength={64}
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Surname" htmlFor="surname">
                <Input
                  id="surname"
                  name="surname"
                  required
                  maxLength={64}
                  autoComplete="family-name"
                />
              </Field>
            </div>

            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
              />
            </Field>

            <Field
              label="Mobile (optional)"
              htmlFor="mobile"
              help="So we can reach you about your application."
            >
              <Input
                id="mobile"
                type="tel"
                name="mobile"
                maxLength={32}
                autoComplete="tel"
              />
            </Field>

            <Field label="Password" htmlFor="partner-password">
              <Input
                id="partner-password"
                type="password"
                name="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
              />
            </Field>
            <PasswordRules inputId="partner-password" />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Create account &amp; continue
              </Button>
            </div>
          </form>
        </section>

        <p className="card-sub" style={{ marginTop: "var(--s-5)" }}>
          Run an exclusive region: your first {PARTNER_FREE_MONTHS} months are
          free, then a {PARTNER_PLATFORM_FEE_PCT}% platform fee applies to the
          listing fees you collect. <Link href="/partners">How it works →</Link>
        </p>
      </div>
    </div>
  );
}

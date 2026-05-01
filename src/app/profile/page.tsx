import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateLocation, updateProfile } from "@/lib/actions/auth";
import { suggestLocationFromIp } from "@/lib/geo";
import { listActiveRegions, matchRegion } from "@/lib/regions";
import { Button, Field, Input } from "../_components/ui";

const TITLES = ["Mr", "Mrs", "Ms", "Mx", "Dr", "Prof"];

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { saved } = await searchParams;
  const regions = await listActiveRegions();

  // IP-based suggestion: only meaningful if it maps to one of our regions.
  const ipSuggestion = !user.location ? await suggestLocationFromIp() : null;
  const matchedRegion =
    ipSuggestion && regions.length > 0
      ? matchRegion(regions, ipSuggestion.display)
      : null;

  // Pre-select existing value when it matches a region label exactly.
  const currentLabel = user.location ?? "";

  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 520, margin: "0 auto" }}>
        <p className="eyebrow">Your profile</p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-h1)",
            color: "var(--ink-1)",
            margin: "var(--s-2) 0 var(--s-3)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Profile
        </h1>
        <p style={{ color: "var(--ink-3)", margin: "0 0 var(--s-7)" }}>
          Signed in as <strong>{user.email}</strong>.
        </p>

        {saved && (
          <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
            Saved.
          </p>
        )}

        <section className="form-card" style={{ marginBottom: "var(--s-7)" }}>
          <h2 className="card-heading">Personal info</h2>
          <p className="card-sub">
            Optional. Shown to buyers when you message them.
          </p>

          <form
            action={updateProfile}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <div className="grid-2">
              <Field label="Title" htmlFor="title">
                <select
                  id="title"
                  name="title"
                  className="input"
                  defaultValue={user.title ?? ""}
                >
                  <option value="">—</option>
                  {TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <div />
            </div>

            <div className="grid-2">
              <Field label="First name" htmlFor="first_name">
                <Input
                  id="first_name"
                  name="first_name"
                  type="text"
                  maxLength={64}
                  autoComplete="given-name"
                  defaultValue={user.firstName ?? ""}
                />
              </Field>
              <Field label="Surname" htmlFor="surname">
                <Input
                  id="surname"
                  name="surname"
                  type="text"
                  maxLength={64}
                  autoComplete="family-name"
                  defaultValue={user.surname ?? ""}
                />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Town / city" htmlFor="town">
                <Input
                  id="town"
                  name="town"
                  type="text"
                  maxLength={64}
                  autoComplete="address-level2"
                  defaultValue={user.town ?? ""}
                />
              </Field>
              <Field label="Postcode" htmlFor="postcode">
                <Input
                  id="postcode"
                  name="postcode"
                  type="text"
                  maxLength={16}
                  autoComplete="postal-code"
                  defaultValue={user.postcode ?? ""}
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Save personal info
              </Button>
            </div>
          </form>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Location</h2>
          <p className="card-sub">
            Pick the region we serve that&rsquo;s closest to you. Used to
            tailor the listings you see and shown next to your email in the
            menu bar.
          </p>

          {matchedRegion && (
            <div className="ip-suggest">
              <div className="ip-suggest-text">
                <strong>
                  Looks like you&rsquo;re in {ipSuggestion!.display}.
                </strong>
                <span> Set your region to {matchedRegion.label}?</span>
              </div>
              <form action={updateLocation}>
                <input
                  type="hidden"
                  name="location"
                  value={matchedRegion.label}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  iconRight="check"
                >
                  Use {matchedRegion.label}
                </Button>
              </form>
            </div>
          )}

          {!matchedRegion && ipSuggestion && (
            <p
              className="card-sub"
              style={{ color: "var(--ink-4)", fontStyle: "italic" }}
            >
              We detected you in {ipSuggestion.display}, but it&rsquo;s not in
              one of our covered regions yet. Pick the closest below.
            </p>
          )}

          <form
            action={updateLocation}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <Field
              label="Region"
              htmlFor="location"
              help={
                regions.length === 0
                  ? "No regions are configured yet. Ask an admin."
                  : "Choose one of the regions we currently serve."
              }
            >
              <select
                id="location"
                name="location"
                className="input"
                defaultValue={currentLabel}
                required={regions.length > 0}
              >
                <option value="">Select a region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary" iconRight="arrow">
                Save
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

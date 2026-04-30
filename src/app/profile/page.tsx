import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateLocation } from "@/lib/actions/auth";
import { Button, Field, Input } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { saved } = await searchParams;

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

        <section className="form-card">
          <h2 className="card-heading">Location</h2>
          <p className="card-sub">
            Shown next to your email in the menu bar and on your listings.
          </p>

          <form
            action={updateLocation}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--s-4)",
            }}
          >
            <Field
              label="City or postal code"
              htmlFor="location"
              help="Optional. Free text — anything you want buyers to see."
            >
              <Input
                id="location"
                name="location"
                type="text"
                maxLength={64}
                defaultValue={user.location ?? ""}
                placeholder="e.g. Austin, TX or 78701"
              />
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

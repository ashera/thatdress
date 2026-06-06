import { requireAdmin } from "@/lib/auth";
import {
  getSampleCounts,
  sampleDataEnabled,
  SAMPLE_LISTINGS_DEFAULT,
  SAMPLE_LISTINGS_MAX,
} from "@/lib/sample-data";
import { cleanupSample, seedSample } from "@/lib/actions/admin-sample-data";
import { Button, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sample Data — Admin" };

export default async function SampleDataPage({
  searchParams,
}: {
  searchParams: Promise<{ seeded?: string; cleaned?: string; error?: string }>;
}) {
  await requireAdmin();
  const { seeded, cleaned, error } = await searchParams;
  const enabled = sampleDataEnabled();
  const counts = enabled ? await getSampleCounts() : { users: 0, listings: 0 };

  return (
    <div className="page page--pad">
      <header style={{ marginBottom: "var(--s-5)" }}>
        <h1>Sample Data</h1>
        <p className="sub">
          Seed realistic demo content for local manual testing — sample
          buyers, sellers and a partner, with listings across the active
          regions plus shortlists, offers, messages, a sold listing with a
          review, and a regional listing fee.
        </p>
      </header>

      {!enabled ? (
        <div className="form-card">
          <p className="card-sub" style={{ margin: 0 }}>
            Sample data tools are disabled in production.
          </p>
        </div>
      ) : (
        <>
          {seeded !== undefined && (
            <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
              Seeded sample data ({seeded} listings).
            </p>
          )}
          {cleaned !== undefined && (
            <p className="form-success" style={{ marginBottom: "var(--s-4)" }}>
              Removed sample data ({cleaned} sample users and everything they owned).
            </p>
          )}
          {error === "disabled" && (
            <p className="form-error" style={{ marginBottom: "var(--s-4)" }}>
              Disabled in production.
            </p>
          )}

          <section className="form-card" style={{ padding: "var(--s-5)" }}>
            <h2 className="card-heading" style={{ marginTop: 0 }}>
              Current sample data
            </h2>
            <p className="card-sub" style={{ marginTop: 0 }}>
              {counts.users > 0 ? (
                <>
                  <strong>{counts.users}</strong> sample users ·{" "}
                  <strong>{counts.listings}</strong> listings. Identified by
                  the <code>sample+*@frockd.test</code> email marker.
                </>
              ) : (
                <>No sample data present.</>
              )}
            </p>

            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                flexWrap: "wrap",
                alignItems: "flex-end",
                marginTop: "var(--s-4)",
              }}
            >
              <form
                action={seedSample}
                style={{ display: "flex", gap: "var(--s-2)", alignItems: "flex-end" }}
              >
                <label style={{ fontSize: "var(--t-body-s)", color: "var(--ink-2)" }}>
                  <span style={{ display: "block", marginBottom: 4 }}>
                    Listings (1–{SAMPLE_LISTINGS_MAX})
                  </span>
                  <Input
                    type="number"
                    name="count"
                    min={1}
                    max={SAMPLE_LISTINGS_MAX}
                    defaultValue={SAMPLE_LISTINGS_DEFAULT}
                    style={{ width: 110 }}
                  />
                </label>
                <Button type="submit" variant="primary" iconRight="arrow">
                  {counts.users > 0 ? "Re-seed" : "Seed sample data"}
                </Button>
              </form>
              <form action={cleanupSample}>
                <Button type="submit" variant="ghost">
                  Clean up sample data
                </Button>
              </form>
            </div>

            <p className="card-sub" style={{ marginTop: "var(--s-4)", marginBottom: 0 }}>
              Re-seeding cleans first, so it never piles up duplicates.
              Cleanup only removes rows owned by the sample users — your real
              accounts and the reference data are untouched.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

import type { Region } from "@/lib/regions";
import { setRegion } from "@/lib/actions/regions";
import { Button } from "./ui";

type Props = {
  detected: string | null;
  regions: Region[];
  next?: string;
};

export function RegionPicker({ detected, regions, next = "/" }: Props) {
  return (
    <div className="region-gate-overlay" role="dialog" aria-modal="true">
      <div className="region-gate-card">
        <p className="eyebrow">Where are you riding?</p>
        <h1 className="region-gate-title">Pick your region</h1>

        {regions.length === 0 ? (
          <p className="region-gate-detect" style={{ color: "var(--ink-3)" }}>
            No regions are configured yet. An admin needs to add at least one
            region under <code>/admin/regions</code> before listings can be
            shown.
          </p>
        ) : (
          <>
            <p className="region-gate-detect">
              {detected ? (
                <>
                  We detected your location as <strong>{detected}</strong>.
                </>
              ) : (
                <>
                  We couldn&rsquo;t detect your location automatically. Pick the
                  region you&rsquo;d like to browse.
                </>
              )}
            </p>

            <p className="region-gate-prompt">
              frockd is currently exclusive to these regions. Pick the one
              that fits — you can change it later from the menu.
            </p>

            <ul className="region-gate-list">
              {regions.map((r) => (
                <li key={r.id}>
                  <form action={setRegion}>
                    <input type="hidden" name="region_id" value={r.id} />
                    <input type="hidden" name="next" value={next} />
                    <Button
                      type="submit"
                      variant="ghost"
                      block
                      iconRight="arrow"
                    >
                      {r.label}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

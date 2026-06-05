import type { ReactNode } from "react";
import type { Region } from "@/lib/regions";
import { setRegion } from "@/lib/actions/regions";
import { Button } from "./ui";

/** The picker only needs an id + label per option, so it accepts the
 *  full Region or the lighter RefOption shape used by the wizard. */
type RegionOption = Pick<Region, "id" | "label">;

type Props = {
  detected?: string | null;
  regions: RegionOption[];
  next?: string;
  /** Server action each region option submits to. Defaults to the
   *  global region switch (sets the cookie + redirects to `next`).
   *  The wizard overrides this to also stamp the listing's region. */
  action?: (formData: FormData) => void | Promise<void>;
  /** Extra hidden inputs forwarded with every option (e.g. listingId). */
  hiddenFields?: { name: string; value: string }[];
  /** "overlay" is the full-screen gate; "bare" drops the fixed overlay
   *  wrapper so the card can sit inside another dialog. */
  variant?: "overlay" | "bare";
  eyebrow?: string;
  title?: string;
  prompt?: ReactNode;
  /** Show the "we detected your location" box. Off in the wizard, where
   *  the user is deliberately switching rather than being detected. */
  showDetected?: boolean;
  /** Region the user is currently in — highlighted in the list so it's
   *  clear which one is active when the picker opens. */
  currentRegionId?: string | null;
};

export function RegionPicker({
  detected = null,
  regions,
  next = "/",
  action = setRegion,
  hiddenFields,
  variant = "overlay",
  eyebrow = "Where are you riding?",
  title = "Pick your region",
  prompt,
  showDetected = true,
  currentRegionId = null,
}: Props) {
  const card = (
    <div className="region-gate-card">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="region-gate-title">{title}</h1>

      {regions.length === 0 ? (
        <p className="region-gate-detect" style={{ color: "var(--ink-3)" }}>
          No regions are configured yet. An admin needs to add at least one
          region under <code>/admin/regions</code> before listings can be
          shown.
        </p>
      ) : (
        <>
          {showDetected && (
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
          )}

          <p className="region-gate-prompt">
            {prompt ?? (
              <>
                frockd is currently exclusive to these regions. Pick the one
                that fits — you can change it later from the menu.
              </>
            )}
          </p>

          <ul className="region-gate-list">
            {regions.map((r) => {
              const isCurrent =
                currentRegionId != null && r.id === currentRegionId;
              return (
                <li key={r.id}>
                  <form action={action}>
                    <input type="hidden" name="region_id" value={r.id} />
                    <input type="hidden" name="next" value={next} />
                    {hiddenFields?.map((h) => (
                      <input
                        key={h.name}
                        type="hidden"
                        name={h.name}
                        value={h.value}
                      />
                    ))}
                    <Button
                      type="submit"
                      variant={isCurrent ? "dark" : "ghost"}
                      block
                      iconRight={isCurrent ? "check" : "arrow"}
                    >
                      {r.label}
                      {isCurrent ? " · Current region" : ""}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );

  if (variant === "bare") return card;

  return (
    <div className="region-gate-overlay" role="dialog" aria-modal="true">
      {card}
    </div>
  );
}

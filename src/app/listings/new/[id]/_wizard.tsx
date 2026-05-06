import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { query } from "@/lib/db";
import { getCurrentUser, type User } from "@/lib/auth";
import { abandonDraftListing } from "@/lib/actions/listing-wizard";
import {
  computeHealth,
  type HealthInput,
  type HealthSuggestion,
} from "@/lib/listing-health";
import { loadSiteSettings } from "@/lib/site-settings";
import { Button, Icon } from "../../../_components/ui";
import type { ComponentProps } from "react";

type IconName = ComponentProps<typeof Icon>["name"];

export type WizardStep =
  | "basics"
  | "photos"
  | "style"
  | "measurements"
  | "condition"
  | "publish";

export type DraftRow = {
  id: string;
  seller_id: string | null;
  is_draft: boolean;
  is_published: boolean;
  title: string | null;
  description: string | null;
  price_cents: number;
  region_id: string | null;
  designer_id: string | null;
  model: string | null;
  year: number | null;
  condition_id: string | null;
  occasion_id: string | null;
  silhouette_id: string | null;
  fabric_id: string | null;
  size_id: string | null;
  neckline_id: string | null;
  sleeve_style_id: string | null;
  length_id: string | null;
  color: string | null;
  bust_inches: string | null;
  waist_inches: string | null;
  hips_inches: string | null;
  original_retail_cents: number | null;
  alterations_text: string | null;
  has_original_receipt: boolean | null;
  location_postal: string | null;
  offers_enabled: boolean | null;
  is_authentic_declared: boolean | null;
  includes_label_lining_photos: boolean | null;
  trust_status: string | null;
  /** Count of attached listing_images. Joined in via subquery so the
   *  wizard's health bar can score photos without a second round-trip. */
  image_count: string;
};

const STEPS: { key: WizardStep; label: string; n: number }[] = [
  { key: "basics", label: "Basics", n: 1 },
  { key: "photos", label: "Photos", n: 2 },
  { key: "style", label: "Style", n: 3 },
  { key: "measurements", label: "Size & fit", n: 4 },
  { key: "condition", label: "Condition", n: 5 },
  { key: "publish", label: "Publish", n: 6 },
];

/** Per-step pose for our seamstress mascot. The PNG sheet at
 *  /public/frockd-seamstress.png is a 5-column × 2-row grid (1408×768),
 *  so we drive a single image as a CSS sprite with percentage
 *  background-position. Each line is the seamstress's voice for the
 *  step — short, warm, in-character. */
const SEAMSTRESS_POSE: Record<
  WizardStep,
  { x: string; y: string; line: string }
> = {
  // (4,0) — standing by the mannequin, presenting / introducing
  basics: {
    x: "100%",
    y: "0%",
    line: "Let's start with who made her.",
  },
  // (0,1) — holding the dress up overhead, "let's see her"
  photos: {
    x: "0%",
    y: "100%",
    line: "Show me every angle — including the label and lining.",
  },
  // (2,0) — holding fabric, considering the cloth
  style: {
    x: "50%",
    y: "0%",
    line: "Now, what kind of dress are we working with?",
  },
  // (0,0) — tape measure at the mannequin
  measurements: {
    x: "0%",
    y: "0%",
    line: "Measure twice, list once.",
  },
  // (3,1) — sitting, hand-sewing — careful inspection
  condition: {
    x: "75%",
    y: "100%",
    line: "Let's give her a careful once-over.",
  },
  // (2,1) — finished gown on the dressform — ready to go
  publish: {
    x: "50%",
    y: "100%",
    line: "She's almost ready to find her next wearer.",
  },
};

function SeamstressMascot({ step }: { step: WizardStep }) {
  const pose = SEAMSTRESS_POSE[step];
  return (
    <div
      role="img"
      aria-label="Frockd seamstress mascot"
      style={{
        flex: "0 0 auto",
        width: 96,
        height: 131,
        borderRadius: 14,
        backgroundColor: "var(--surface-sunken)",
        backgroundImage: "url('/frockd-seamstress.png')",
        backgroundSize: "500% 200%",
        backgroundPosition: `${pose.x} ${pose.y}`,
        backgroundRepeat: "no-repeat",
        border: "1px solid var(--hairline)",
        overflow: "hidden",
      }}
    />
  );
}

export async function loadDraft(
  listingId: string,
  step: WizardStep,
): Promise<{ user: User; draft: DraftRow }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!/^\d+$/.test(listingId)) notFound();

  const r = await query<DraftRow>(
    `SELECT id::text,
            seller_id::text,
            is_draft,
            is_published,
            title,
            description,
            price_cents,
            region_id::text,
            designer_id::text,
            model,
            year,
            condition_id::text,
            occasion_id::text,
            silhouette_id::text,
            fabric_id::text,
            size_id::text,
            neckline_id::text,
            sleeve_style_id::text,
            length_id::text,
            color,
            bust_inches::text,
            waist_inches::text,
            hips_inches::text,
            original_retail_cents,
            alterations_text,
            has_original_receipt,
            location_postal,
            offers_enabled,
            is_authentic_declared,
            includes_label_lining_photos,
            trust_status,
            (
              SELECT COUNT(*)::text FROM listing_images
                WHERE listing_id = listings.id
            ) AS image_count
       FROM listings
      WHERE id = $1::bigint
      LIMIT 1`,
    [listingId],
  );
  const draft = r.rows[0];
  if (!draft) notFound();
  if (!user.isAdmin && draft.seller_id !== user.id) {
    redirect("/listings/mine");
  }
  void step;
  return { user, draft };
}

/** True when the wizard is editing an already-published listing (or
 *  any non-draft state, e.g. sold). Drives copy, button text, and
 *  whether the publish step toggles is_draft on save. */
export function isEditMode(draft: DraftRow): boolean {
  return !draft.is_draft;
}

/** Coerce a DraftRow into the shape computeHealth expects. The DB
 *  returns numerics as strings via ::text casts; bools as booleans. */
export function draftToHealthInput(d: DraftRow): HealthInput {
  function num(s: string | null | undefined): number | null {
    if (s == null || s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return {
    designerId: d.designer_id,
    model: d.model,
    year: d.year,
    occasionId: d.occasion_id,
    conditionId: d.condition_id,
    sizeId: d.size_id,
    silhouetteId: d.silhouette_id,
    fabricId: d.fabric_id,
    necklineId: d.neckline_id,
    sleeveStyleId: d.sleeve_style_id,
    lengthId: d.length_id,
    color: d.color,
    bustInches: num(d.bust_inches),
    waistInches: num(d.waist_inches),
    hipsInches: num(d.hips_inches),
    originalRetailCents: d.original_retail_cents,
    hasOriginalReceipt: !!d.has_original_receipt,
    isAuthenticDeclared: !!d.is_authentic_declared,
    includesLabelLiningPhotos: !!d.includes_label_lining_photos,
    description: d.description,
    imageCount: Number(d.image_count ?? 0),
  };
}

/** Seller-only listing-health indicator, sticky-ish at the top of the
 *  wizard. Score updates as the seller fills more fields; suggestions
 *  surface the highest-impact missing items as quick links to the
 *  relevant step. Crossing the verified threshold → unlocks the
 *  public Verified badge. Threshold is loaded from site_settings so
 *  admin tweaks take effect immediately. */
async function HealthBar({
  draft,
}: {
  draft: DraftRow;
}) {
  const settings = await loadSiteSettings();
  const verifiedThreshold = settings.healthThresholdVerified;
  const { score, suggestions } = computeHealth(draftToHealthInput(draft));
  const meetsVerified = score >= verifiedThreshold;
  const top = suggestions.slice(0, 3);
  return (
    <div
      style={{
        margin: "0 0 var(--s-5)",
        padding: "var(--s-4) var(--s-5)",
        background: meetsVerified ? "var(--volt-50)" : "var(--surface-sunken)",
        border: `1px solid ${meetsVerified ? "var(--volt-200)" : "var(--hairline)"}`,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Listing health
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink-1)",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          {score}
          <span
            style={{
              color: "var(--ink-4)",
              fontSize: 14,
              fontWeight: 400,
            }}
          >
            {" / 100"}
          </span>
        </div>
        {meetsVerified && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--volt-700)",
              fontWeight: 700,
              background: "#fff",
              border: "1px solid var(--volt-200)",
              padding: "4px 10px",
              borderRadius: 999,
            }}
          >
            ✓ Earns Verified badge
          </span>
        )}
      </div>

      <div
        style={{
          height: 6,
          background: "var(--hairline)",
          borderRadius: 999,
          marginTop: "var(--s-3)",
          overflow: "hidden",
        }}
        aria-hidden
      >
        <div
          style={{
            width: `${score}%`,
            height: "100%",
            background: meetsVerified
              ? "var(--volt-500)"
              : "var(--ink-2)",
            transition: "width 200ms",
          }}
        />
      </div>

      {top.length > 0 && (
        <div
          style={{
            marginTop: "var(--s-3)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: "var(--t-body-s)",
              color: "var(--ink-3)",
            }}
          >
            {meetsVerified
              ? "More improvements you could make:"
              : `Reach ${verifiedThreshold} to earn the Verified badge — top suggestions:`}
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {top.map((s: HealthSuggestion, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "baseline",
                  fontSize: "var(--t-body-s)",
                  color: "var(--ink-2)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--volt-700)",
                    fontWeight: 700,
                    minWidth: 28,
                  }}
                >
                  +{s.points}
                </span>
                <Link
                  href={`/listings/new/${draft.id}/${s.step}`}
                  style={{
                    color: "var(--ink-1)",
                    textDecoration: "underline",
                    textDecorationColor: "var(--hairline-strong)",
                    textUnderlineOffset: 3,
                  }}
                >
                  {s.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WizardShell({
  step,
  draft,
  errorMessage,
  children,
}: {
  step: WizardStep;
  /** Full draft row — used to render the health bar and provide the
   *  draft id for the abandon-draft form. */
  draft: DraftRow;
  errorMessage?: string | null;
  children: ReactNode;
}) {
  const currentIdx = STEPS.findIndex((s) => s.key === step);
  const draftId = draft.id;
  const editMode = isEditMode(draft);
  return (
    <div className="page page--pad">
      <main style={{ maxWidth: 1152, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 18,
            margin: "0 0 var(--s-5)",
          }}
        >
          <SeamstressMascot step={step} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {editMode
                ? `Edit listing — step ${currentIdx + 1} of ${STEPS.length}`
                : `List your dress — step ${currentIdx + 1} of ${STEPS.length}`}
            </p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-h1)",
                color: "var(--ink-1)",
                margin: "var(--s-1) 0 var(--s-2)",
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              {STEPS[currentIdx]?.label ?? "New listing"}
            </h1>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                color: "var(--ink-2)",
                margin: 0,
                fontSize: 16,
                lineHeight: 1.4,
              }}
            >
              {SEAMSTRESS_POSE[step].line}
            </p>
          </div>
        </div>

        <ol
          style={{
            display: "flex",
            gap: "var(--s-2)",
            listStyle: "none",
            padding: 0,
            margin: "0 0 var(--s-7)",
            flexWrap: "wrap",
          }}
        >
          {STEPS.map((s, i) => {
            const active = i === currentIdx;
            const done = i < currentIdx;
            return (
              <li key={s.key} style={{ flex: "1 1 120px", minWidth: 120 }}>
                <Link
                  href={`/listings/new/${draftId}/${s.key}`}
                  style={{
                    display: "block",
                    borderRadius: 999,
                    padding: "8px 14px",
                    background: active
                      ? "var(--ink-1)"
                      : done
                      ? "var(--volt-100, #f4f1ea)"
                      : "var(--surface-2, #f7f6f3)",
                    color: active
                      ? "#fff"
                      : done
                      ? "var(--ink-1)"
                      : "var(--ink-3)",
                    border: "1px solid var(--line, #e9e5df)",
                    fontSize: "var(--t-body-s)",
                    fontWeight: 600,
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  {s.n}. {s.label}
                </Link>
              </li>
            );
          })}
        </ol>

        <HealthBar draft={draft} />

        {errorMessage && (
          <p className="form-error" style={{ marginBottom: "var(--s-5)" }}>
            {errorMessage}
          </p>
        )}

        {children}

        {editMode ? (
          <div
            style={{
              marginTop: "var(--s-7)",
              paddingTop: "var(--s-5)",
              borderTop: "1px solid var(--line, #e9e5df)",
              textAlign: "center",
            }}
          >
            <Link
              href={`/listings/${draftId}`}
              style={{
                color: "var(--ink-3)",
                fontSize: "var(--t-body-s)",
                textDecoration: "underline",
              }}
            >
              ← Done — back to listing
            </Link>
          </div>
        ) : (
          <form
            action={abandonDraftListing}
            style={{
              marginTop: "var(--s-7)",
              paddingTop: "var(--s-5)",
              borderTop: "1px solid var(--line, #e9e5df)",
              textAlign: "center",
            }}
          >
            <input type="hidden" name="listingId" value={draftId} />
            <button
              type="submit"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--ink-3)",
                fontSize: "var(--t-body-s)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Discard this draft
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export function StepNav({
  prevHref,
  submitLabel = "Save & continue",
}: {
  prevHref?: string;
  submitLabel?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--s-3)",
        marginTop: "var(--s-5)",
      }}
    >
      {prevHref ? (
        <Link
          href={prevHref}
          style={{
            color: "var(--ink-2)",
            fontSize: "var(--t-body-s)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back
        </Link>
      ) : (
        <span />
      )}
      <Button type="submit" variant="primary" iconRight="arrow">
        {submitLabel}
      </Button>
    </div>
  );
}

export function WizardHero({
  icon,
  headline,
  body,
}: {
  icon: IconName;
  headline: string;
  body: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--s-4)",
        alignItems: "flex-start",
        padding: "var(--s-5)",
        marginBottom: "var(--s-7)",
        borderRadius: 16,
        background:
          "linear-gradient(135deg, var(--volt-100, #f4f1ea) 0%, var(--surface-2, #f7f6f3) 100%)",
        border: "1px solid var(--line, #e9e5df)",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "var(--ink-1)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size="lg" />
      </div>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--ink-1)",
            margin: 0,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
          }}
        >
          {headline}
        </h2>
        <p
          style={{
            color: "var(--ink-2)",
            fontSize: "var(--t-body-s)",
            margin: "var(--s-2) 0 0",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

export function WizardTip({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        margin: "var(--s-3) 0 0",
        padding: "var(--s-3)",
        background: "var(--surface-2, #f7f6f3)",
        borderRadius: 10,
        fontSize: "var(--t-body-s)",
        color: "var(--ink-2)",
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden style={{ color: "var(--volt-500, #d4a017)", flex: "0 0 auto" }}>
        ★
      </span>
      <span>{children}</span>
    </p>
  );
}

export const STEP_ERRORS: Record<string, string> = {
  "invalid-title": "Give your listing a short title.",
  "invalid-designer": "Pick a designer.",
  "invalid-model": "Style name or model is required.",
  "invalid-year": "Year must be between 1990 and next year.",
  "invalid-occasion": "Pick an occasion.",
  "invalid-condition": "Pick a condition.",
  "invalid-price": "Enter a valid price.",
  "invalid-location": "Postal code or location is required.",
  "out-of-range": "One of the numeric values is out of the allowed range.",
  "too-many": "You can attach up to 10 photos.",
  "too-large": "Each photo must be 5 MB or smaller.",
  "bad-type": "Photos must be JPEG, PNG, or WebP.",
  "upload-failed": "Photos failed to save. Try again with smaller files.",
  incomplete: "Some required fields aren't filled in yet.",
  "authenticity-required":
    "Tick the 'I confirm this dress is authentic' box before publishing.",
};

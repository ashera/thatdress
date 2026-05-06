import {
  deleteDraftImage,
  saveDraftPhotos,
  uploadDraftSlotPhoto,
} from "@/lib/actions/listing-wizard";
import { query } from "@/lib/db";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
} from "../_wizard";

export const dynamic = "force-dynamic";

const SLOTS = [
  {
    role: "front",
    label: "Full-length front",
    desc: "On a hanger, dress form, or model. Show the whole silhouette in soft daylight against a plain wall.",
  },
  {
    role: "back",
    label: "Back",
    desc: "Closures, train, anything that's different from the front.",
  },
  {
    role: "label",
    label: "Designer label",
    desc: "Macro shot of the brand label sewn at the neckline or waist. The single biggest signal that separates legitimate listings from sketchy ones.",
  },
  {
    role: "lining",
    label: "Lining / wrong-side",
    desc: "The inside of the dress. Buyers (and our verifiers) use this to spot fakes.",
  },
] as const;

type SlotRole = (typeof SLOTS)[number]["role"];

type DraftImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
  role: string | null;
};

async function fetchDraftImages(listingId: string): Promise<DraftImageRow[]> {
  try {
    const r = await query<DraftImageRow>(
      `SELECT id::text, is_primary, position, role
         FROM listing_images
        WHERE listing_id = $1::bigint
        ORDER BY is_primary DESC, position, id`,
      [listingId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function WizardPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? STEP_ERRORS[error] ?? null : null;

  const { draft } = await loadDraft(id, "photos");
  const images = await fetchDraftImages(draft.id);

  const imageByRole = new Map<SlotRole, DraftImageRow>();
  for (const img of images) {
    if (img.role && SLOTS.some((s) => s.role === img.role)) {
      imageByRole.set(img.role as SlotRole, img);
    }
  }
  const legacyImages = images.filter((img) => !img.role);

  return (
    <WizardShell step="photos" draft={draft} errorMessage={errorMessage}>
      <WizardHero
        icon="camera"
        headline="Photos buyers (and we) need to see"
        body="Upload one shot for each of the four slots below. Front and back help buyers picture themselves in the dress; label and lining are how we verify it's the real thing."
      />

      <section
        className="form-card"
        style={{ marginBottom: "var(--s-5)" }}
      >
        <h2 className="card-heading">The four shots that matter most</h2>
        <p className="card-sub">
          Cover all four and your listing crosses every photo-related
          Verified-badge requirement.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "var(--s-4)",
            marginTop: "var(--s-4)",
          }}
        >
          {SLOTS.map((slot) => {
            const existing = imageByRole.get(slot.role);
            return (
              <SlotPanel
                key={slot.role}
                listingId={draft.id}
                slot={slot}
                existing={existing ?? null}
              />
            );
          })}
        </div>

        {legacyImages.length > 0 && (
          <div
            style={{
              marginTop: "var(--s-5)",
              paddingTop: "var(--s-4)",
              borderTop: "1px solid var(--hairline)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
                margin: "0 0 var(--s-3)",
              }}
            >
              Other photos already on this listing
            </h3>
            <p
              style={{
                fontSize: "var(--t-body-s)",
                color: "var(--ink-3)",
                margin: "0 0 var(--s-3)",
              }}
            >
              These were uploaded before the slot system. Remove any
              you no longer want, and re-upload them into a slot above.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: "var(--s-3)",
              }}
            >
              {legacyImages.map((img) => (
                <div
                  key={img.id}
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--hairline)",
                    background: "var(--surface-sunken)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      aspectRatio: "1 / 1",
                      width: "100%",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/listings/${draft.id}/images/${img.id}`}
                      alt=""
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <form
                      action={deleteDraftImage}
                      style={{ position: "absolute", top: 6, right: 6 }}
                    >
                      <input
                        type="hidden"
                        name="listingId"
                        value={draft.id}
                      />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button
                        type="submit"
                        title="Remove"
                        style={{
                          width: 26,
                          height: 26,
                          border: 0,
                          borderRadius: "50%",
                          background: "rgba(28, 24, 22, 0.7)",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <form action={saveDraftPhotos}>
        <input type="hidden" name="listingId" value={draft.id} />
        <StepNav prevHref={`/listings/new/${draft.id}/basics`} />
      </form>
    </WizardShell>
  );
}

function SlotPanel({
  listingId,
  slot,
  existing,
}: {
  listingId: string;
  slot: { role: string; label: string; desc: string };
  existing: DraftImageRow | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        borderRadius: 10,
        background: "var(--surface-sunken)",
        border: "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: existing ? "#16a34a" : "var(--ink-3)",
        }}
      >
        {existing ? "✓ Uploaded" : "Required"}
      </div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 15,
          color: "var(--ink-1)",
        }}
      >
        {slot.label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-2)",
          lineHeight: 1.4,
        }}
      >
        {slot.desc}
      </div>

      {existing && (
        <div
          style={{
            position: "relative",
            aspectRatio: "1 / 1",
            width: "100%",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/listings/${listingId}/images/${existing.id}`}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <form
            action={deleteDraftImage}
            style={{ position: "absolute", top: 6, right: 6 }}
          >
            <input type="hidden" name="listingId" value={listingId} />
            <input type="hidden" name="imageId" value={existing.id} />
            <button
              type="submit"
              title="Remove this photo"
              style={{
                width: 28,
                height: 28,
                border: 0,
                borderRadius: "50%",
                background: "rgba(28, 24, 22, 0.7)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </form>
        </div>
      )}

      <form
        action={uploadDraftSlotPhoto}
        encType="multipart/form-data"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: 4,
        }}
      >
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="role" value={slot.role} />
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          required
          className="file-input"
          style={{ fontSize: 12 }}
        />
        <button
          type="submit"
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: existing ? "transparent" : "var(--ink-1)",
            color: existing ? "var(--ink-2)" : "#fff",
            border: existing
              ? "1px solid var(--hairline-strong)"
              : "1px solid var(--ink-1)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {existing ? "Replace" : "Upload"}
        </button>
      </form>
    </div>
  );
}

import {
  deleteDraftImage,
  saveDraftPhotos,
} from "@/lib/actions/listing-wizard";
import {
  moveListingImage,
  setPrimaryImage,
} from "@/lib/actions/listings";
import { query } from "@/lib/db";
import { Button, Field } from "../../../../_components/ui";
import {
  loadDraft,
  StepNav,
  STEP_ERRORS,
  WizardHero,
  WizardShell,
  WizardTip,
} from "../_wizard";

export const dynamic = "force-dynamic";

type DraftImageRow = {
  id: string;
  is_primary: boolean;
  position: number;
};

async function fetchDraftImages(listingId: string): Promise<DraftImageRow[]> {
  try {
    const r = await query<DraftImageRow>(
      `SELECT id::text, is_primary, position
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

  return (
    <WizardShell step="photos" draft={draft} errorMessage={errorMessage}>
      <WizardHero
        icon="camera"
        headline="Photos buyers (and we) need to see"
        body="A few great shots help your dress sell, but four specific shots help us verify it. Front-on, back, designer label close-up, lining / wrong-side. Hang the dress against a plain wall in soft daylight — no clutter, no hangers in frame."
      />

      <section
        className="form-card"
        style={{ marginBottom: "var(--s-5)" }}
      >
        <h2 className="card-heading">The four shots that matter most</h2>
        <p className="card-sub">
          Cover these and your listing crosses every photo-related
          Verified-badge requirement. Add as many extra angles as you
          like — beading, hem, alterations, etc.
        </p>
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "var(--s-3)",
            listStyle: "none",
            padding: 0,
            margin: "var(--s-3) 0 0",
          }}
        >
          {[
            {
              k: "Full-length front",
              v: "On a hanger, dress form, or model. Show the whole silhouette.",
            },
            {
              k: "Back",
              v: "Closures, train, anything that's different from the front.",
            },
            {
              k: "Designer label",
              v: "Macro shot of the brand label sewn at the neckline / waist.",
            },
            {
              k: "Lining / wrong-side",
              v: "The inside of the dress — buyers use this to spot fakes.",
            },
          ].map((s) => (
            <li
              key={s.k}
              style={{
                padding: "10px 12px",
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
                  color: "var(--ink-3)",
                  marginBottom: 4,
                }}
              >
                {s.k}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  lineHeight: 1.4,
                }}
              >
                {s.v}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {images.length > 0 && (
        <section className="form-card" style={{ marginBottom: "var(--s-5)" }}>
          <h2 className="card-heading">Already uploaded</h2>
          <p className="card-sub">
            {images.length === 1
              ? "1 photo on this listing."
              : `${images.length} photos on this listing.`}{" "}
            Add more below, or remove one if it&rsquo;s wrong.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: "var(--s-3)",
              marginTop: "var(--s-3)",
            }}
          >
            {images.map((img, idx) => {
              // First image (highest is_primary, then position) is the
              // default. Reorder buttons only apply to non-primary images
              // so the default is always the first thumb.
              const canMoveUp = !img.is_primary && idx > 1;
              const canMoveDown = !img.is_primary && idx < images.length - 1;
              return (
                <div
                  key={img.id}
                  style={{
                    position: "relative",
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--line, #e9e5df)",
                    background: "var(--surface-2, #f7f6f3)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      aspectRatio: "1 / 1",
                      width: "100%",
                    }}
                  >
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
                    {img.is_primary && (
                      <span
                        style={{
                          position: "absolute",
                          top: 6,
                          left: 6,
                          background: "var(--ink-1)",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                          padding: "3px 7px",
                          borderRadius: 999,
                          textTransform: "uppercase",
                        }}
                      >
                        Default
                      </span>
                    )}
                    <form
                      action={deleteDraftImage}
                      style={{ position: "absolute", top: 6, right: 6 }}
                    >
                      <input type="hidden" name="listingId" value={draft.id} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button
                        type="submit"
                        title="Remove this photo"
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
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      padding: 6,
                      borderTop: "1px solid var(--hairline)",
                    }}
                  >
                    {!img.is_primary && (
                      <form action={setPrimaryImage}>
                        <input type="hidden" name="listingId" value={draft.id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Use as default photo"
                        >
                          ★ Default
                        </Button>
                      </form>
                    )}
                    {canMoveUp && (
                      <form action={moveListingImage}>
                        <input type="hidden" name="listingId" value={draft.id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Move up"
                        >
                          ↑
                        </Button>
                      </form>
                    )}
                    {canMoveDown && (
                      <form action={moveListingImage}>
                        <input type="hidden" name="listingId" value={draft.id} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title="Move down"
                        >
                          ↓
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <form
        action={saveDraftPhotos}
        encType="multipart/form-data"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        <input type="hidden" name="listingId" value={draft.id} />

        <section className="form-card">
          <h2 className="card-heading">
            {images.length > 0 ? "Add more photos" : "Photos"}
          </h2>
          <p className="card-sub">
            Up to 10 · JPEG, PNG, WebP · 5 MB each. The first one becomes
            the default — pick the one you&rsquo;d want a buyer to see first.
          </p>
          <Field label="Add photos" htmlFor="images">
            <input
              id="images"
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="file-input"
            />
          </Field>
          <WizardTip>
            Five photos beats ten blurry ones. A full-length hero, the back,
            close-ups of the bodice and any beading, and a flat-lay of the
            label is plenty.
          </WizardTip>
        </section>

        <section className="form-card">
          <h2 className="card-heading">Verification confirmation</h2>
          <p className="card-sub">
            Tick this when your uploaded photos cover the designer
            label and lining shots. Required for the Verified badge.
          </p>
          <label className="check-row" style={{ alignItems: "flex-start" }}>
            <input
              type="checkbox"
              name="includes_label_lining_photos"
              defaultChecked={!!draft.includes_label_lining_photos}
              style={{ marginTop: 4 }}
            />
            <span style={{ display: "block" }}>
              <strong style={{ color: "var(--ink-1)" }}>
                My photos include a designer-label close-up and a
                lining / wrong-side shot
              </strong>
              <span
                style={{
                  display: "block",
                  color: "var(--ink-3)",
                  fontSize: "var(--t-body-s)",
                  marginTop: 2,
                }}
              >
                Optional, but it&rsquo;s the single biggest signal that
                separates legitimate listings from sketchy ones.
              </span>
            </span>
          </label>
        </section>

        <StepNav prevHref={`/listings/new/${draft.id}/basics`} />
      </form>
    </WizardShell>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  listPinterestBoards,
  pinterestConfigured,
} from "@/lib/pinterest";
import { createPinFromListing } from "@/lib/actions/admin-pinterest";
import { Button, Field, Input, Textarea } from "../../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pin to Pinterest — Admin" };

type Listing = {
  id: string;
  title: string;
  designer_name: string | null;
  has_image: boolean;
};

const ERROR_COPY: Record<string, string> = {
  "bad-listing": "That doesn't look like a valid listing id.",
  "missing-board": "Pick a Pinterest board before submitting.",
  "missing-title": "Title is required.",
  "listing-not-found": "Listing not found.",
  "listing-not-public":
    "Listing isn't published — Pinterest needs a publicly-reachable URL.",
  "no-image": "Listing has no photo to use as the pin media.",
  "pin-failed": "Pinterest rejected the pin.",
};

async function loadRecentListings(): Promise<Listing[]> {
  try {
    const r = await query<{
      id: string;
      title: string;
      designer_name: string | null;
      has_image: boolean;
    }>(
      `SELECT l.id::text,
              l.title,
              d.name AS designer_name,
              EXISTS (
                SELECT 1 FROM listing_images li
                  WHERE li.listing_id = l.id
              ) AS has_image
         FROM listings l
         JOIN dresses dr ON dr.id = l.dress_id
         LEFT JOIN designers d ON d.id = dr.designer_id
        WHERE l.is_draft     = FALSE
          AND l.is_published = TRUE
          AND l.sold_at IS NULL
          AND l.trust_status <> 'flagged'
        ORDER BY l.is_featured DESC, l.created_at DESC
        LIMIT 50`,
    );
    return r.rows;
  } catch {
    return [];
  }
}

export default async function AdminPinterestPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    pin_url?: string;
    error?: string;
    status?: string;
    detail?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const configured = pinterestConfigured();

  const [listings, boardsResult] = await Promise.all([
    loadRecentListings(),
    configured
      ? listPinterestBoards()
      : Promise.resolve({
          ok: false as const,
          status: 0,
          error: "PINTEREST_KEY not configured",
        }),
  ]);

  const errorMsg = sp.error ? ERROR_COPY[sp.error] : null;
  const detailMsg = sp.detail ? decodeURIComponent(sp.detail) : null;
  const httpStatus = sp.status ? Number(sp.status) : null;

  return (
    <div className="page admin-page" style={{ maxWidth: 880 }}>
      <Link href="/admin/links" className="back-link">
        ← Link manager
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Link manager · Pinterest</p>
        <h1>Pin a listing to Pinterest</h1>
        <p className="sub">
          Compose a Pinterest pin for one of your live listings.
          We&rsquo;ll fire it off to the Pinterest v5 API and log the
          resulting pin URL to the backlinks ledger automatically so
          it picks up the standard verification pipeline. Pinterest
          links carry <code>rel=&quot;nofollow ugc&quot;</code> so the
          SEO win is referral traffic + pin discoverability, not
          PageRank.
        </p>
      </header>

      {sp.ok === "1" && sp.pin_url && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Pin created. View it at{" "}
          <a
            href={decodeURIComponent(sp.pin_url)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            {decodeURIComponent(sp.pin_url)}
          </a>
          . A backlinks row has been added — see it on{" "}
          <Link
            href="/admin/links"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            /admin/links
          </Link>
          .
        </p>
      )}

      {errorMsg && (
        <div className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          <strong>{errorMsg}</strong>
          {httpStatus ? ` HTTP ${httpStatus}.` : ""}
          {detailMsg && (
            <div
              style={{
                marginTop: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              {detailMsg}
            </div>
          )}
        </div>
      )}

      {!configured && (
        <div className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          <strong>PINTEREST_KEY is not set.</strong> Add the trial
          access token (or proper OAuth access token) to the Railway
          environment variables and redeploy.
        </div>
      )}

      {configured && !boardsResult.ok && (
        <div className="form-error" style={{ marginBottom: "var(--s-5)" }}>
          <strong>Could not load Pinterest boards.</strong>
          {boardsResult.status
            ? ` HTTP ${boardsResult.status}.`
            : ""}{" "}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ink-3)",
            }}
          >
            {boardsResult.error}
          </span>
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "var(--ink-3)",
            }}
          >
            Most common cause: trial access token expired (they last
            30 days) or the token lacks the <code>boards:read</code>{" "}
            scope. Refresh / re-mint the token in the Pinterest
            developer portal.
          </div>
        </div>
      )}

      <section className="form-card">
        <h2 className="card-heading" style={{ marginTop: 0 }}>
          New pin
        </h2>
        <form
          action={createPinFromListing}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--s-4)",
          }}
        >
          <Field label="Listing to pin" htmlFor="listing_id">
            <select
              id="listing_id"
              name="listing_id"
              className="input"
              required
              defaultValue=""
            >
              <option value="" disabled>
                {listings.length === 0
                  ? "No live listings yet"
                  : `Select a listing (${listings.length})`}
              </option>
              {listings.map((l) => {
                const label = [
                  l.designer_name,
                  l.title,
                  l.has_image ? "" : "(no photo)",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <option
                    key={l.id}
                    value={l.id}
                    disabled={!l.has_image}
                  >
                    {label}
                  </option>
                );
              })}
            </select>
          </Field>

          <Field
            label="Pinterest board"
            htmlFor="board_id"
            help={
              boardsResult.ok
                ? `${boardsResult.boards.length} boards on this account.`
                : "Boards couldn't load — check the error above."
            }
          >
            <select
              id="board_id"
              name="board_id"
              className="input"
              required
              defaultValue=""
              disabled={!boardsResult.ok || !configured}
            >
              <option value="" disabled>
                {boardsResult.ok
                  ? "Select a board"
                  : "Boards unavailable"}
              </option>
              {boardsResult.ok &&
                boardsResult.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.privacy === "SECRET" ? " (secret)" : ""}
                  </option>
                ))}
            </select>
          </Field>

          <Field
            label="Pin title"
            htmlFor="title"
            help="Pinterest caps this at 100 characters."
          >
            <Input
              id="title"
              name="title"
              type="text"
              required
              maxLength={100}
              placeholder="e.g. Pre-loved Carla Zampatti dress · size 10"
            />
          </Field>

          <Field
            label="Pin description"
            htmlFor="description"
            help="Up to 500 characters. Include relevant keywords ('wedding-guest dress', 'pre-loved', city)."
          >
            <Textarea
              id="description"
              name="description"
              rows={4}
              maxLength={500}
              placeholder="Pre-loved formal dress from frockd, Australia's peer-to-peer marketplace. Verified seller, honest condition."
            />
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="submit"
              variant="primary"
              iconRight="arrow"
              disabled={!configured || !boardsResult.ok}
            >
              Pin to Pinterest
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

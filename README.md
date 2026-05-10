# frockd

A peer-to-peer marketplace for pre-loved formal dresses. Sellers list a dress,
buyers browse, message, and make offers. Hosted at
[www.frockd.com.au](https://www.frockd.com.au).

Next.js 16 (App Router) · TypeScript · React 19 · PostgreSQL · Tailwind v4.

---

## Quickstart

```bash
npm install
cp .env.example .env.local           # then edit DATABASE_URL
npm run db:setup                      # apply schema.sql + seed.sql
npm run dev                           # http://localhost:3000
```

Health probe: `GET /api/health` returns JSON with `db: ok | error`. The route
itself always returns HTTP 200 once the server is up so platform healthchecks
stay green even before the DB is wired.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run db:setup` | Apply `db/schema.sql` then `db/seed.sql` against `DATABASE_URL`. Both files are idempotent — safe to re-run. |

---

## Architecture

### Stack
- **Next.js 16** App Router, server components, server actions. **Note:** this
  is not the Next.js most LLM training data knows — there are breaking
  changes (params is `Promise<{...}>` on dynamic routes, etc.). When in doubt,
  read `node_modules/next/dist/docs/`.
- **PostgreSQL** via [`pg`](https://node-postgres.com/) and a tiny
  `query<T>(sql, params)` wrapper in `src/lib/db.ts`. No ORM.
- **Tailwind v4** + a token-based design system in `src/app/globals.css`
  (`--ink-*`, `--volt-*`, `--blush-*`, type scale, spacing scale).
- **Auth**: bcryptjs + opaque session cookies in a `sessions` table. No JWT,
  no NextAuth.
- **Transactional email**: Resend (optional — sends become no-ops when
  `RESEND_API_KEY` is unset).
- **AI**: Anthropic (blog builder, listing copy assist) + Pexels (hero images
  for blog posts).

### Schema migrations
`db/schema.sql` is the single source of truth. Every change is written as an
**idempotent** statement (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`, `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT …`). Railway re-applies
the file on every deploy via the start command (see Deployment below).

There is no separate migrations folder; every schema change goes into
`schema.sql` directly and ships with the same commit as the code that uses
it.

### Project layout

```
src/
  app/
    _components/        Shared UI: Button, Icon, TrustBadge, FlagListingDialog, ListingCard…
    api/                Route handlers (health, image streaming, cron)
    listings/           Browse + detail + edit + new (wizard)
    listings/new/[id]/  6-step listing wizard (basics → style → measurements → condition → photos → publish)
    dresses/[id]/relist Owner-facing relist landing reached from the nudge email
    admin/              Admin console: dashboard, dresses, users, listings, flagged queue, reviews, regions, ref data, blog, site settings, docs
    blog/               Public blog
    tools/              Value estimator, alterations cost, buyer's checklist
    messages/           Buyer ↔ seller DMs
    profile/            Account settings
    regions/            Region picker
    layout.tsx          Root layout, metadataBase, robots policy
    sitemap.ts          /sitemap.xml — homepage + listings + blog
    robots.ts           /robots.txt — toggled by site_settings.allow_indexing
  lib/
    db.ts               pg Pool + query() helper
    auth.ts             Session cookies, getCurrentUser, requireAdmin
    actions/            Server actions (listings, wizard, messages, offers, admin…)
    cron/               Job bodies — runRelistNudgeBatch, runSavedSearchDigest
    relist-nudge.ts     Per-dress sendRelistNudge helper, shared by cron + admin force-fire
    listing-health.ts   Pure 0–100 listing-completeness calculator
    listing-trust.ts    Pure trust-ladder derivation
    listing-trust-server.ts  recomputeListingTrustStatus — wired into every save path
    site-settings.ts    Single-row settings table (allow_indexing, health threshold)
    regions.ts          Region cookie + region gate
    anthropic.ts        Anthropic SDK helpers (prompt caching, ITPM-aware budget)
    email.ts            Resend wrapper, getBaseUrl()
db/
  schema.sql            Idempotent schema
  seed.sql              Sample listings + ref data (idempotent)
scripts/
  db-setup.mjs          Reads DATABASE_URL, applies schema + seed
public/                 Logo, sketch, icons, seamstress mascot sprite
.env.example            All recognised env vars documented inline
railway.toml            Railway deploy config
```

---

## Feature systems

### Listing wizard (`src/app/listings/new/[id]/`)
Six-step server-rendered wizard, used for both new listings and edits:

1. **Basics** — designer / model / year
2. **Style** — silhouette, fabric, neckline, sleeve, length, colour, occasion
3. **Measurements** — labelled size, bust / waist / hips, original retail
4. **Condition** — grade + alterations notes + receipt
5. **Photos** — image upload + primary
6. **Publish** — title, description, price, region, authenticity declaration

Each step persists immediately on save (no monolithic submit) and writes to
both `dresses` (designer / silhouette / measurements / colour / retail —
attrs that travel with the garment) and `listings` (occasion / condition /
price / photos — attrs of one offering). Edit and new-listing modes share
the same components and copy adapts via `isEditMode(draft)`.

A per-step **seamstress mascot** (`public/frockd-seamstress.png` driven as a
CSS sprite) gives each step a face and a one-line caption.

### Listing health score (`src/lib/listing-health.ts`)
Pure 0–100 calculator across six categories (basics 25 · style 12 ·
measurements 12 · provenance 15 · photos 20 · label/lining 6 · description
10). Returns `{ score, suggestions }` where suggestions are sorted by points
descending so callers can show the top-N highest-impact missing items.

The wizard renders a sticky-ish health bar at the top of every step. The
listing detail page shows a slim owner-only health strip under the title for
the seller (and admins).

### Trust ladder (`src/lib/listing-trust.ts`)
Four states: `self-declared` · `verified` · `authenticated` · `flagged`.

- `verified` — auto-elevated when seller has declared authenticity, ticked
  the label/lining-photos box, uploaded ≥ 3 photos, **and** crossed the
  configurable health threshold (default 75; tunable from the admin
  site-settings page). Earns a public gold pill.
- `authenticated` — reserved for a future third-party verification partner.
- `flagged` — set by admins from the detail page or the flagged queue. Each
  flag captures *who, when, why* in `listing_flags` (audit trail).
- Self-heal: every detail-page render re-derives trust from live data and
  writes back if the stored value has drifted. Safe because the read is
  free (data already loaded) and the write only fires on actual change.

### Regions (`src/lib/regions.ts`)
Cookie-based region gate. A first-visit modal asks the buyer to pick their
metro; thereafter, browse and homepage filter to listings in that region.
Sellers see all of their own listings regardless of viewer region. The middleware allow-lists crawlers and unauthenticated marketing pages.

### Messages, offers, shortlist
- `conversations` + `messages` tables back buyer ↔ seller DMs.
- `offers` table: optional buyer offers when seller enables `offers_enabled`.
- `shortlists` table: signed-in buyers can save listings.

### Tools (`src/app/tools/`)
- **Value estimator** — Anthropic-backed price suggestion from designer +
  retail + condition + age.
- **Alterations cost estimator** — typical AUD ranges for common alteration
  types.
- **Buyer's checklist** — interactive inspection checklist with click-to-tick
  pills.

### Blog builder (`src/lib/blog.ts`, `src/lib/actions/blog-builder.ts`)
Admin-only LLM-assisted blog post drafting. Topic → outline → body → hero
image. Anthropic prompts are cache-controlled (ephemeral) to stay under the
10k ITPM tier-1 cap; Pexels supplies banner photos. Drafts and saved
references live in their own tables.

### Circular marketplace · dresses + relist nudge
A dress is its own first-class entity (`dresses` table) — one physical
garment, persistent across owners. A `listings` row is one offering of that
dress. Each transfer is captured in `dress_ownership_events` so we have an
audit trail of who has owned the dress and how.

Lifecycle (`dresses.disposition`):
- `available` — owner is selling it (split into **Listed** / **Drafted** in
  the admin UI based on whether a live published listing exists)
- `in-use` — sold to an attributed buyer; `next_relist_nudge_at = +90 days`
- `kept` — owner opted out of nudges via the relist landing
- `lost` — sold elsewhere; we don't know who has it

The **relist nudge** turns one-shot sales into a re-circulating inventory.
Once `disposition='in-use'`, the cron job (`runRelistNudgeBatch`) emails
the owner asking if they'd like to relist — they land on
`/dresses/[id]/relist` and either start a new listing pre-filled from the
existing dress (`startRelistFromDress`) or mark the dress kept
(`markDressKept`). The cron's SQL is the rate limiter: a dress just
nudged falls out of the candidate set for 60 days.

Listings on the dress detail timeline (`/admin/dresses/[id]`) also surface
prior provenance via the listing detail page's "Frockd history" section,
which counts prior on-platform sales and shows first-listed / last-sold
month-year (anonymous; no prior owner names or prices).

### Admin (`src/app/admin/`)
- `/admin` — console index, with a Background jobs panel that runs both
  cron jobs (`runRelistNudgeBatch`, `runSavedSearchDigest`) on every load.
  Per-row gates inside each job stop refreshes from re-sending.
- `/admin/dashboard` — vital-signs KPI grid (users, listings, GMV, dresses,
  open queues), single-viewport, every tile drills into its detail page.
- `/admin/dresses` + `/admin/dresses/[id]` — dresses with current owners,
  per-row force-send relist nudge, detail page with full ownership-event
  timeline of every listing the dress has been on.
- `/admin/users` + `/admin/users/[id]` — list, suspend, plus per-user
  detail with seller ratings (incl. admin-hidden), conversation history
  with View-details into `/messages/[id]`.
- `/admin/listings` + `/admin/listings/flagged` — listing browse + flag
  queue with reason / flagger / timestamp.
- `/admin/reviews` — moderate buyer reviews.
- `/admin/regions`, `/admin/reference-data` — taxonomy editing.
- `/admin/blog` — blog post composer.
- `/admin/site-settings` — `allow_indexing` (controls `/robots.txt`),
  `health_threshold_verified` (drives the verified badge),
  `reviews_display_threshold`.
- `/admin/database` — quick DB introspection.
- `/admin/tickets` — support inbox.
- `/admin/docs`, `/admin/docs/flows` — rendered README + Mermaid workflow
  diagrams (see `docs/flows.md`).

### SEO
- Per-listing `generateMetadata` (title, description, canonical, OG, Twitter)
- `Product` + `BreadcrumbList` JSON-LD on listing detail pages
- Dynamic `opengraph-image.tsx` (1200×630) per listing — Satori-powered, with
  WebP→JPEG conversion via `sharp` because Satori only renders PNG/JPEG/SVG
- `/sitemap.xml` includes home, all live listings, and blog posts
- `/robots.txt` blocks/allows indexing based on site-settings toggle so the
  staging Railway deploy doesn't get crawled before launch

---

## Deployment (Railway)

The repo ships with `railway.toml`:

```toml
[deploy]
startCommand = "npm run db:setup && npm run start"
healthcheckPath = "/api/health"
```

Steps:

1. Point Railway at this repo. Nixpacks auto-detects Next.js and runs
   `npm install && npm run build`.
2. Add a Postgres plugin in the same project.
3. Set the env vars below. At minimum you need `DATABASE_URL` and
   `DATABASE_SSL=true`.
4. *Settings → Networking → Generate Domain* (or attach a custom domain).

`db:setup` runs on every container boot (start command, not preDeploy — that
hook is silently skipped on Railway), so schema and seed always reach the DB
before the server accepts traffic.

### Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | prod | Set to `true` for managed Postgres |
| `APP_URL` | recommended | Public URL used in transactional emails. Falls back to request headers if unset. |
| `CANONICAL_URL` | recommended | Used for `metadataBase` and canonical links. Defaults to `https://www.frockd.com.au`. |
| `RESEND_API_KEY` | optional | Resend transactional email. Sends become no-ops if unset. |
| `RESEND_FROM` | optional | From address (default `frockd <noreply@frockd.com.au>`). |
| `ANTHROPIC_API_KEY` | optional | Blog builder + value-estimator. Disables those features if unset. |
| `PEXELS_API_KEY` | optional | Blog hero images. |
| `VIEW_IP_SALT` | optional | Salt for hashed IPs in `listing_views`. |
| `CRON_SECRET` | optional | Bearer-token for `/api/cron/saved-searches` and `/api/cron/relist-nudge`. Both jobs also run on every `/admin` page load, so an external scheduler is optional pre-launch. |

---

## Conventions

- **No ORM.** Hand-rolled SQL via `query<T>(sql, params)`. Most files declare
  a `Row` type local to the file that mirrors the SELECT.
- **Pure logic in `src/lib/*.ts`; server-only logic in `src/lib/*-server.ts`
  or `src/lib/actions/*.ts`** with `"server-only"` or `"use server"` at the
  top.
- **Server actions over API routes** for mutations. API routes only exist for
  the health probe, image streaming, and cron.
- **JSDoc on everything non-obvious.** Most files have a top-of-file comment
  explaining what the module is for; tricky helpers (trust derivation, health
  scoring, region gate, recompute timing) are commented in detail.
- **Idempotent migrations only.** No timestamped migration files — every
  change goes into `db/schema.sql` directly with `IF NOT EXISTS` /
  `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT …` patterns so re-running the
  setup script is always safe.
- **Currency: AUD**, locale `en-AU`, formatted via `Intl.NumberFormat`.

## Working with AI agents on this repo

`AGENTS.md` and `CLAUDE.md` flag the Next.js 16 breaking changes for any LLM
working on the codebase — read those before editing. The auto-memory system
under `.claude/` is per-developer and not committed.

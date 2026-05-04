# frockd

Peer-to-peer marketplace for pre-loved formal dresses. Next.js + Node + PostgreSQL.

## Stack

- [Next.js](https://nextjs.org/) 16 (App Router) with TypeScript
- [Tailwind CSS](https://tailwindcss.com/) v4
- [PostgreSQL](https://www.postgresql.org/) via [`pg`](https://node-postgres.com/)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and point it at your Postgres instance:

   ```bash
   cp .env.example .env.local
   # then edit .env.local
   ```

3. Apply schema and seed sample data:

   ```bash
   npm run db:setup
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). The home page reports
   whether the database is reachable. Other routes:

   - [`/listings`](http://localhost:3000/listings) — sample listings from Postgres
   - [`/api/health`](http://localhost:3000/api/health) — JSON health probe

## Deploy to Railway

The repo includes a `railway.toml` with healthcheck and restart policy. To deploy:

1. **Create the service** — point Railway at this repo. Nixpacks auto-detects
   Next.js and runs `npm run build` then `npm run start`.
2. **Add a Postgres plugin** in the same project.
3. **Set environment variables** on the service:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `DATABASE_SSL` = `true` (Railway managed Postgres requires SSL)
4. **Generate a public domain** under *Settings → Networking → Generate Domain*.

The schema and seed data are applied automatically on every deploy by the
`preDeployCommand` in `railway.toml` (`npm run db:setup`). Both `db/schema.sql`
and `db/seed.sql` are idempotent, so re-running them on each deploy is safe.

The `/api/health` endpoint always returns HTTP 200 once the server is up; the
JSON body indicates whether the database is reachable. This means Railway's
healthcheck stays green even if `DATABASE_URL` isn't wired up yet.

## Project layout

```
src/
  app/
    api/health/route.ts   # GET /api/health — server + DB status JSON
    listings/page.tsx     # GET /listings — reads from Postgres
    page.tsx              # Home page; reports DB connectivity
  lib/
    db.ts                 # pg Pool + query() helper
db/
  schema.sql              # initial schema
  seed.sql                # sample data (idempotent)
scripts/
  db-setup.mjs            # apply schema.sql + seed.sql via pg
railway.toml              # Railway build/deploy config
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — start the production server
- `npm run lint` — run ESLint
- `npm run db:setup` — apply `db/schema.sql` and `db/seed.sql` against `DATABASE_URL`

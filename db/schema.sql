-- Initial schema for frockd.
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql
-- (or `npm run db:setup`, which also seeds.)

-- =========================================================
-- Pre-launch cleanup: drop legacy eBike tables/columns so a
-- previously-deployed instance can be re-run cleanly. These
-- DROPs are no-ops on a fresh database.
-- =========================================================

DROP TABLE IF EXISTS bike_makes        CASCADE;
DROP TABLE IF EXISTS bike_categories   CASCADE;
DROP TABLE IF EXISTS bike_classes      CASCADE;
DROP TABLE IF EXISTS frame_styles      CASCADE;
DROP TABLE IF EXISTS frame_materials   CASCADE;
DROP TABLE IF EXISTS wheel_sizes       CASCADE;
DROP TABLE IF EXISTS gender_fits       CASCADE;
DROP TABLE IF EXISTS motor_brands      CASCADE;
DROP TABLE IF EXISTS motor_types       CASCADE;
DROP TABLE IF EXISTS drive_modes       CASCADE;
DROP TABLE IF EXISTS brake_types       CASCADE;
DROP TABLE IF EXISTS suspension_types  CASCADE;
DROP TABLE IF EXISTS body_positions    CASCADE;

ALTER TABLE IF EXISTS listings
  DROP COLUMN IF EXISTS make_id,
  DROP COLUMN IF EXISTS bike_category_id,
  DROP COLUMN IF EXISTS bike_class_id,
  DROP COLUMN IF EXISTS frame_size,
  DROP COLUMN IF EXISTS frame_style_id,
  DROP COLUMN IF EXISTS frame_material_id,
  DROP COLUMN IF EXISTS wheel_size_id,
  DROP COLUMN IF EXISTS gender_fit_id,
  DROP COLUMN IF EXISTS suspension_type_id,
  DROP COLUMN IF EXISTS brake_type_id,
  DROP COLUMN IF EXISTS motor_brand_id,
  DROP COLUMN IF EXISTS motor_type_id,
  DROP COLUMN IF EXISTS motor_watts_nominal,
  DROP COLUMN IF EXISTS motor_watts_peak,
  DROP COLUMN IF EXISTS motor_torque_nm,
  DROP COLUMN IF EXISTS battery_wh,
  DROP COLUMN IF EXISTS battery_voltage,
  DROP COLUMN IF EXISTS battery_amp_hours,
  DROP COLUMN IF EXISTS charge_time_hours,
  DROP COLUMN IF EXISTS top_speed_mph,
  DROP COLUMN IF EXISTS range_miles_min,
  DROP COLUMN IF EXISTS range_miles_max,
  DROP COLUMN IF EXISTS drive_mode_id,
  DROP COLUMN IF EXISTS mileage,
  DROP COLUMN IF EXISTS weight_lbs,
  DROP COLUMN IF EXISTS display_type,
  DROP COLUMN IF EXISTS drivetrain,
  DROP COLUMN IF EXISTS accessories,
  DROP COLUMN IF EXISTS modifications,
  DROP COLUMN IF EXISTS has_warranty,
  DROP COLUMN IF EXISTS warranty_text,
  DROP COLUMN IF EXISTS body_position_id;

-- =========================================================
-- Auth & users
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL    PRIMARY KEY,
  email         TEXT         UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS location          TEXT,
  ADD COLUMN IF NOT EXISTS title             TEXT,
  ADD COLUMN IF NOT EXISTS first_name        TEXT,
  ADD COLUMN IF NOT EXISTS surname           TEXT,
  ADD COLUMN IF NOT EXISTS town              TEXT,
  ADD COLUMN IF NOT EXISTS postcode          TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  -- Referral programme. Every user gets a personal referral_code they
  -- can share — friends who arrive via /?ref=<code> and then sign up
  -- get this user's id stored as referred_by_user_id, so we can credit
  -- the referrer when the friend creates a verified listing.
  ADD COLUMN IF NOT EXISTS referral_code        TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at          TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx
  ON users (referral_code) WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_referred_by_idx
  ON users (referred_by_user_id) WHERE referred_by_user_id IS NOT NULL;

-- Backfill referral_code for accounts that pre-date the column. MD5
-- of (id || email) is deterministic, easy to express in pure SQL, and
-- collision-resistant (email is itself UNIQUE), so each user gets a
-- unique 8-char code without needing a server-side loop.
UPDATE users
   SET referral_code = UPPER(SUBSTRING(MD5(id::text || email) FROM 1 FOR 8))
 WHERE referral_code IS NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT         PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Admin impersonation: when an admin clicks 'Log in as' on a user
-- detail page we mint a new session for the target user with this
-- column set to the original admin's id. The auth layer reads it
-- back out so the menu bar can show 'Acting as X — switch back' and
-- the switch-back action knows which admin to restore.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS impersonator_user_id BIGINT
    REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- =========================================================
-- Listings (core)
-- =========================================================

CREATE TABLE IF NOT EXISTS listings (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  description TEXT,
  price_cents INTEGER     NOT NULL CHECK (price_cents >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS seller_id    BIGINT  REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sold_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_draft     BOOLEAN NOT NULL DEFAULT FALSE;

-- Sale nudge — keeps marketplace inventory fresh by prompting the
-- seller every ~14 days to confirm a listing is still available, or
-- mark it sold. last_active_confirmed_at moves forward each time the
-- seller hits 'Still for sale' on /listings/mine, pushing the next
-- nudge another window out. last_sale_nudge_sent_at lets admins force
-- the prompt from /admin/listings ahead of the timer (and stops
-- duplicate emails from a future cron).
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS last_active_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sale_nudge_sent_at  TIMESTAMPTZ;

-- Buyer attribution for sold listings. Set when the seller picks the
-- buyer from their conversation list at mark-sold time. NULL when
-- the listing is unsold or was 'sold elsewhere' (off-platform). Drives
-- the seller-rating loop — only the recorded buyer can leave a review.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS sold_to_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_sold_to_idx
  ON listings (sold_to_user_id) WHERE sold_to_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS listings_draft_idx
  ON listings (seller_id, is_draft) WHERE is_draft = TRUE;

CREATE INDEX IF NOT EXISTS listings_seller_id_idx ON listings (seller_id);
CREATE INDEX IF NOT EXISTS listings_published_idx ON listings (is_published, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_images (
  id          BIGSERIAL    PRIMARY KEY,
  listing_id  BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  mime_type   TEXT         NOT NULL,
  bytes       BYTEA        NOT NULL,
  byte_size   INTEGER      NOT NULL,
  position    INTEGER      NOT NULL DEFAULT 0,
  is_primary  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_images_listing_id_idx
  ON listing_images (listing_id, position, id);

-- Only one primary image per listing.
CREATE UNIQUE INDEX IF NOT EXISTS listing_images_one_primary_idx
  ON listing_images (listing_id) WHERE is_primary;

-- Each listing-image can be tagged with the verification role it
-- represents — front-on shot, back, designer label close-up, or the
-- lining / wrong-side. NULL means the photo isn't pinned to a slot
-- (legacy uploads, or any 'extras' added later). The wizard's photos
-- step renders one slot per role; the unique partial index below
-- enforces 'one photo per role per listing' so re-uploading replaces.
ALTER TABLE listing_images
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE listing_images
  DROP CONSTRAINT IF EXISTS listing_images_role_check;
ALTER TABLE listing_images
  ADD CONSTRAINT listing_images_role_check
    CHECK (role IS NULL OR role IN ('front', 'back', 'label', 'lining'));

CREATE UNIQUE INDEX IF NOT EXISTS listing_images_one_per_role_idx
  ON listing_images (listing_id, role) WHERE role IS NOT NULL;

-- =========================================================
-- Reference data (admin-managed lookups)
-- All tables share: id, sort_order, is_active. Slug+label
-- everywhere except `designers` which uses `name` directly.
-- =========================================================

CREATE TABLE IF NOT EXISTS designers (
  id          BIGSERIAL    PRIMARY KEY,
  name        TEXT         UNIQUE NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Resale-market tier drives the value-estimator depreciation range:
--   premium       => 35–55% of RRP at like-new + recent
--   mid (default) => 40–60% (contemporary brands; the bulk of the market)
--   fast-fashion  => 15–30% (H&M / Zara / generic)
ALTER TABLE designers
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'mid';

-- Tracks designers added on-the-fly by sellers from the listing wizard
-- when their dress's brand isn't in the curated list. Admins can sort
-- on this column from /admin/reference-data and decide whether to
-- merge with an existing entry, set a tier, or leave alone.
ALTER TABLE designers
  ADD COLUMN IF NOT EXISTS is_user_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE designers
  DROP CONSTRAINT IF EXISTS designers_tier_check;
ALTER TABLE designers
  ADD CONSTRAINT designers_tier_check
    CHECK (tier IN ('premium', 'mid', 'fast-fashion'));

CREATE TABLE IF NOT EXISTS occasions (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS silhouettes (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS fabrics (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dress_sizes (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS necklines (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sleeve_styles (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dress_lengths (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS condition_grades (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- =========================================================
-- Dresses — first-class entity. A dress is a physical garment that
-- can be listed multiple times by different owners over its life.
-- A listing is one sale event; dress + sequential listings together
-- give us a circular marketplace where buyers can relist months
-- after the purchase.
-- =========================================================

CREATE TABLE IF NOT EXISTS dresses (
  id                       BIGSERIAL    PRIMARY KEY,
  -- Physical attributes (immutable across owners — the dress IS what it is).
  designer_id              BIGINT       REFERENCES designers(id)     ON DELETE SET NULL,
  model                    TEXT,
  year                     INTEGER,
  silhouette_id            BIGINT       REFERENCES silhouettes(id)   ON DELETE SET NULL,
  fabric_id                BIGINT       REFERENCES fabrics(id)       ON DELETE SET NULL,
  neckline_id              BIGINT       REFERENCES necklines(id)     ON DELETE SET NULL,
  sleeve_style_id          BIGINT       REFERENCES sleeve_styles(id) ON DELETE SET NULL,
  length_id                BIGINT       REFERENCES dress_lengths(id) ON DELETE SET NULL,
  size_id                  BIGINT       REFERENCES dress_sizes(id)   ON DELETE SET NULL,
  bust_inches              NUMERIC(4,1),
  waist_inches             NUMERIC(4,1),
  hips_inches              NUMERIC(4,1),
  color                    TEXT,
  original_retail_cents    INTEGER,
  -- Lifecycle.
  created_by_user_id       BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  current_owner_user_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  disposition              TEXT         NOT NULL DEFAULT 'available',
  -- Relist nudge timers — wired in Phase 3.
  next_relist_nudge_at     TIMESTAMPTZ,
  last_relist_nudge_sent_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE dresses
  DROP CONSTRAINT IF EXISTS dresses_disposition_check;
ALTER TABLE dresses
  ADD CONSTRAINT dresses_disposition_check
    CHECK (disposition IN ('available', 'in-use', 'kept', 'lost'));

CREATE INDEX IF NOT EXISTS dresses_designer_id_idx ON dresses (designer_id);
CREATE INDEX IF NOT EXISTS dresses_size_id_idx     ON dresses (size_id);
CREATE INDEX IF NOT EXISTS dresses_owner_idx
  ON dresses (current_owner_user_id) WHERE current_owner_user_id IS NOT NULL;

-- =========================================================
-- Dress ownership events — append-only audit trail of who has
-- owned each dress and how it moved between owners. Drives the
-- Phase 5 provenance display and gives the Phase 3 nudge job a
-- reliable history to query.
-- =========================================================

CREATE TABLE IF NOT EXISTS dress_ownership_events (
  id              BIGSERIAL    PRIMARY KEY,
  dress_id        BIGINT       NOT NULL REFERENCES dresses(id)  ON DELETE CASCADE,
  -- from = previous owner; NULL for 'created' (no prior owner).
  from_user_id    BIGINT                REFERENCES users(id)    ON DELETE SET NULL,
  -- to   = new owner; NULL for 'sold-elsewhere' (buyer unknown).
  to_user_id      BIGINT                REFERENCES users(id)    ON DELETE SET NULL,
  via_listing_id  BIGINT                REFERENCES listings(id) ON DELETE SET NULL,
  event_type      TEXT         NOT NULL,
  occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE dress_ownership_events
  DROP CONSTRAINT IF EXISTS dress_ownership_events_type_check;
ALTER TABLE dress_ownership_events
  ADD CONSTRAINT dress_ownership_events_type_check
    CHECK (event_type IN ('created', 'sold', 'sold-elsewhere'));

CREATE INDEX IF NOT EXISTS dress_ownership_events_dress_idx
  ON dress_ownership_events (dress_id, occurred_at DESC);

-- Backfill a 'created' event for any existing dress that doesn't
-- yet have one. Idempotent: only inserts where no event row exists
-- for that dress. Test data is small; this is cheap.
INSERT INTO dress_ownership_events (dress_id, to_user_id, event_type, occurred_at)
SELECT d.id, d.created_by_user_id, 'created', d.created_at
  FROM dresses d
 WHERE NOT EXISTS (
   SELECT 1 FROM dress_ownership_events e WHERE e.dress_id = d.id
 );

-- =========================================================
-- One-time migration: detect the pre-dress schema, wipe test
-- data, then drop the columns that have moved to `dresses`.
-- The DO block self-guards on the existence of listings.designer_id
-- so it runs at most once. Subsequent deploys skip the body.
-- =========================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'listings' AND column_name = 'designer_id'
  ) THEN
    -- Cascade-wipe everything keyed off listings (listing_images,
    -- listing_reviews, listing_flags, listing_review_tokens,
    -- listing_views, conversations, messages, offers, shortlists).
    DELETE FROM listings;
    DELETE FROM dresses;
  END IF;
END $$;

ALTER TABLE listings DROP COLUMN IF EXISTS designer_id;
ALTER TABLE listings DROP COLUMN IF EXISTS model;
ALTER TABLE listings DROP COLUMN IF EXISTS year;
ALTER TABLE listings DROP COLUMN IF EXISTS silhouette_id;
ALTER TABLE listings DROP COLUMN IF EXISTS fabric_id;
ALTER TABLE listings DROP COLUMN IF EXISTS neckline_id;
ALTER TABLE listings DROP COLUMN IF EXISTS sleeve_style_id;
ALTER TABLE listings DROP COLUMN IF EXISTS length_id;
ALTER TABLE listings DROP COLUMN IF EXISTS size_id;
ALTER TABLE listings DROP COLUMN IF EXISTS color;
ALTER TABLE listings DROP COLUMN IF EXISTS bust_inches;
ALTER TABLE listings DROP COLUMN IF EXISTS waist_inches;
ALTER TABLE listings DROP COLUMN IF EXISTS hips_inches;
ALTER TABLE listings DROP COLUMN IF EXISTS original_retail_cents;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dress_id BIGINT REFERENCES dresses(id) ON DELETE CASCADE;

-- After the wipe, every remaining listing must have a dress; new
-- inserts via startDraftListing always pair the two. Setting NOT NULL
-- here is safe because the table is empty (or is empty post-wipe).
ALTER TABLE listings ALTER COLUMN dress_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS listings_dress_id_idx ON listings (dress_id);

-- =========================================================
-- Listing detail columns that stay per-sale (not on dresses).
-- =========================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS condition_id         BIGINT  REFERENCES condition_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occasion_id          BIGINT  REFERENCES occasions(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alterations_text     TEXT,
  ADD COLUMN IF NOT EXISTS location_postal      TEXT,
  ADD COLUMN IF NOT EXISTS has_original_receipt BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS listings_occasion_id_idx ON listings (occasion_id);

-- =========================================================
-- Reference data seed (idempotent)
-- =========================================================

INSERT INTO designers (name, sort_order, tier) VALUES
  ('Vera Wang', 10, 'premium'),
  ('Marchesa', 20, 'premium'),
  ('Carolina Herrera', 30, 'premium'),
  ('Oscar de la Renta', 40, 'premium'),
  ('Reem Acra', 50, 'premium'),
  ('Monique Lhuillier', 60, 'premium'),
  ('Zuhair Murad', 70, 'premium'),
  ('Elie Saab', 80, 'premium'),
  ('Galvan', 90, 'premium'),
  ('Alex Perry', 200, 'premium'),
  ('Self-Portrait', 100, 'mid'),
  ('Reformation', 110, 'mid'),
  ('Rixo', 120, 'mid'),
  ('Needle & Thread', 130, 'mid'),
  ('ML Monique Lhuillier', 140, 'mid'),
  ('BHLDN', 150, 'mid'),
  ('Saloni', 160, 'mid'),
  ('Markarian', 170, 'mid'),
  ('Cinq à Sept', 180, 'mid'),
  ('Alice + Olivia', 190, 'mid'),
  ('Other', 9999, 'mid')
ON CONFLICT (name) DO NOTHING;

-- Backfill tier for designer rows that pre-date this column.
UPDATE designers SET tier = 'premium' WHERE name IN (
  'Vera Wang', 'Marchesa', 'Carolina Herrera', 'Oscar de la Renta',
  'Reem Acra', 'Monique Lhuillier', 'Zuhair Murad', 'Elie Saab',
  'Galvan', 'Alex Perry'
) AND tier = 'mid';

INSERT INTO occasions (slug, label, sort_order) VALUES
  ('wedding-guest',    'Wedding guest',       10),
  ('black-tie',        'Black-tie / gala',    20),
  ('cocktail',         'Cocktail',            30),
  ('prom',             'Prom',                40),
  ('bridesmaid',       'Bridesmaid',          50),
  ('mother-of-bride',  'Mother of the bride', 60),
  ('formal',           'Formal',              70),
  ('semi-formal',      'Semi-formal',         80),
  ('red-carpet',       'Red carpet / event',  90),
  ('graduation',       'Graduation',         100)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO silhouettes (slug, label, sort_order) VALUES
  ('a-line',         'A-line',          10),
  ('ball-gown',      'Ball gown',       20),
  ('mermaid',        'Mermaid / trumpet', 30),
  ('sheath',         'Sheath / column', 40),
  ('empire',         'Empire',          50),
  ('fit-and-flare',  'Fit-and-flare',   60),
  ('shift',          'Shift',           70),
  ('wrap',           'Wrap',            80),
  ('slip',           'Slip',            90),
  ('two-piece',      'Two-piece',      100)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO fabrics (slug, label, sort_order) VALUES
  ('silk',     'Silk',     10),
  ('satin',    'Satin',    20),
  ('chiffon',  'Chiffon',  30),
  ('lace',     'Lace',     40),
  ('tulle',    'Tulle',    50),
  ('velvet',   'Velvet',   60),
  ('crepe',    'Crepe',    70),
  ('organza',  'Organza',  80),
  ('taffeta',  'Taffeta',  90),
  ('sequined', 'Sequined', 100),
  ('beaded',   'Beaded',   110),
  ('jersey',   'Jersey',   120)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dress_sizes (slug, label, sort_order) VALUES
  ('xs',    'XS',    10),
  ('s',     'S',     20),
  ('m',     'M',     30),
  ('l',     'L',     40),
  ('xl',    'XL',    50),
  ('xxl',   'XXL',   60),
  ('us-0',  'US 0',  100),
  ('us-2',  'US 2',  110),
  ('us-4',  'US 4',  120),
  ('us-6',  'US 6',  130),
  ('us-8',  'US 8',  140),
  ('us-10', 'US 10', 150),
  ('us-12', 'US 12', 160),
  ('us-14', 'US 14', 170),
  ('us-16', 'US 16', 180),
  ('us-18', 'US 18', 190),
  ('us-20', 'US 20', 200),
  ('us-22', 'US 22', 210)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO necklines (slug, label, sort_order) VALUES
  ('v-neck',       'V-neck',           10),
  ('sweetheart',   'Sweetheart',       20),
  ('halter',       'Halter',           30),
  ('strapless',    'Strapless',        40),
  ('off-shoulder', 'Off-the-shoulder', 50),
  ('scoop',        'Scoop',            60),
  ('square',       'Square',           70),
  ('plunge',       'Plunge',           80),
  ('high-neck',    'High neck',        90),
  ('cowl',         'Cowl',            100),
  ('illusion',     'Illusion',        110),
  ('one-shoulder', 'One-shoulder',    120)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO sleeve_styles (slug, label, sort_order) VALUES
  ('sleeveless',     'Sleeveless',     10),
  ('cap-sleeve',     'Cap sleeve',     20),
  ('short-sleeve',   'Short sleeve',   30),
  ('three-quarter',  '3/4 sleeve',     40),
  ('long-sleeve',    'Long sleeve',    50),
  ('spaghetti-strap','Spaghetti strap',60),
  ('bishop',         'Bishop',         70),
  ('puff',           'Puff',           80)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dress_lengths (slug, label, sort_order) VALUES
  ('mini',   'Mini',         10),
  ('knee',   'Knee-length',  20),
  ('midi',   'Midi',         30),
  ('tea',    'Tea-length',   40),
  ('floor',  'Floor-length', 50),
  ('train',  'With train',   60)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO condition_grades (slug, label, sort_order) VALUES
  ('new-with-tags', 'New with tags', 10),
  ('like-new',      'Like new',      20),
  ('excellent',     'Excellent',     30),
  ('good',          'Good',          40),
  ('fair',          'Fair',          50)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Regions (geographical coverage)
-- match_pattern is a comma-separated case-insensitive list of
-- substrings checked against the IP-derived "City, ST" string.
-- =========================================================

CREATE TABLE IF NOT EXISTS regions (
  id            BIGSERIAL    PRIMARY KEY,
  slug          TEXT         UNIQUE NOT NULL,
  label         TEXT         NOT NULL,
  short_name    TEXT,
  match_pattern TEXT,
  sort_order    INTEGER      NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS short_name TEXT;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS region_id BIGINT REFERENCES regions(id) ON DELETE SET NULL;

-- Trust + authenticity ladder. Sellers declare authenticity in the
-- publish step; listings that meet the photo/measurement/health
-- criteria auto-elevate to 'verified' and earn a public badge.
-- 'authenticated' is reserved for a future third-party verification
-- partnership; 'flagged' is the path back down when admin reviews
-- a buyer report.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS is_authentic_declared        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS includes_label_lining_photos BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trust_status                 TEXT    NOT NULL DEFAULT 'self-declared';

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_trust_status_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_trust_status_check
    CHECK (trust_status IN ('self-declared', 'verified', 'authenticated', 'flagged'));

-- Audit trail for trust_status='flagged' transitions. Each row captures
-- *who* flagged a listing, *when*, and *why*. Marked resolved when an
-- admin restores the listing to 'self-declared' or accepts the flag.
CREATE TABLE IF NOT EXISTS listing_flags (
  id                   BIGSERIAL    PRIMARY KEY,
  listing_id           BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  flagged_by_user_id   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  reason               TEXT         NOT NULL,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at          TIMESTAMPTZ,
  resolved_by_user_id  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  resolution_note      TEXT
);

CREATE INDEX IF NOT EXISTS listing_flags_listing_idx ON listing_flags (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS listing_flags_open_idx
  ON listing_flags (listing_id) WHERE resolved_at IS NULL;

-- Seller ratings — left by the recorded buyer of a sold listing.
-- Stars (1-5) plus an optional free-text comment and three yes/no
-- chips that match the categories most pre-loved-clothes buyers care
-- about. flagged_at + flag_reason let sellers contest a review;
-- hidden_by_admin_at takes a review off the public profile while
-- keeping the row for audit.
CREATE TABLE IF NOT EXISTS listing_reviews (
  id                  BIGSERIAL    PRIMARY KEY,
  listing_id          BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seller_id           BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id            BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars               SMALLINT     NOT NULL CHECK (stars BETWEEN 1 AND 5),
  body                TEXT,
  as_described        BOOLEAN,
  easy_communication  BOOLEAN,
  smooth_handover     BOOLEAN,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  edited_at           TIMESTAMPTZ,
  hidden_by_admin_at  TIMESTAMPTZ,
  flagged_at          TIMESTAMPTZ,
  flag_reason         TEXT
);

-- One rating per buyer-listing transaction; if a buyer wants to
-- update they edit their existing row.
CREATE UNIQUE INDEX IF NOT EXISTS listing_reviews_one_per_transaction
  ON listing_reviews (listing_id, buyer_id);

CREATE INDEX IF NOT EXISTS listing_reviews_seller_idx
  ON listing_reviews (seller_id, created_at DESC);

-- Tokenised review-prompt links. Generated when the seller picks the
-- buyer at mark-sold time and emailed to that buyer. Buyer follows
-- the link, signs in if needed, and submits the review form. Tokens
-- are single-use — used_at stamps when consumed — and expire after
-- 60 days so an unanswered link can't be replayed forever.
CREATE TABLE IF NOT EXISTS listing_review_tokens (
  id           BIGSERIAL    PRIMARY KEY,
  listing_id   BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT         NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  NOT NULL,
  used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS listing_review_tokens_open_idx
  ON listing_review_tokens (buyer_id) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_region_idx ON listings (region_id);

INSERT INTO regions (slug, label, short_name, match_pattern, sort_order) VALUES
  ('us-tx-austin',    'Austin Metro, TX',  'Austin Metro',   'Austin, Round Rock, Pflugerville, Cedar Park', 10),
  ('us-ca-bay-area',  'Bay Area, CA',      'Bay Area',       'San Francisco, Oakland, San Jose, Berkeley, Palo Alto', 20),
  ('us-ny-nyc',       'New York City, NY', 'New York City',  'New York, Brooklyn, Queens, Manhattan, Bronx', 30),
  ('us-wa-seattle',   'Seattle, WA',       'Seattle',        'Seattle, Bellevue, Redmond', 40),
  ('uk-london',       'London, UK',        'London',         'London', 50),
  ('ca-toronto',      'Toronto, ON',       'Toronto',        'Toronto, Mississauga', 60)
ON CONFLICT (slug) DO NOTHING;

-- Backfill short_name for any seeded rows that pre-date this column.
UPDATE regions SET short_name = 'Austin Metro'  WHERE slug = 'us-tx-austin'   AND short_name IS NULL;
UPDATE regions SET short_name = 'Bay Area'      WHERE slug = 'us-ca-bay-area' AND short_name IS NULL;
UPDATE regions SET short_name = 'New York City' WHERE slug = 'us-ny-nyc'      AND short_name IS NULL;
UPDATE regions SET short_name = 'Seattle'       WHERE slug = 'us-wa-seattle'  AND short_name IS NULL;
UPDATE regions SET short_name = 'London'        WHERE slug = 'uk-london'      AND short_name IS NULL;
UPDATE regions SET short_name = 'Toronto'       WHERE slug = 'ca-toronto'     AND short_name IS NULL;

-- =========================================================
-- Direct messaging
-- =========================================================

CREATE TABLE IF NOT EXISTS conversations (
  id          BIGSERIAL    PRIMARY KEY,
  listing_id  BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id   BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Allow admin DMs (no listing) by lifting the NOT NULL on listing_id.
ALTER TABLE conversations ALTER COLUMN listing_id DROP NOT NULL;

-- Each (listing, buyer) pair gets at most one conversation.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_listing_buyer_idx
  ON conversations (listing_id, buyer_id);

-- One direct-message thread per (admin-as-buyer, target user) pair when
-- listing_id IS NULL. Partial index so the listing-scoped index above
-- still applies to listing-tied conversations.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm_idx
  ON conversations (buyer_id, seller_id) WHERE listing_id IS NULL;

CREATE INDEX IF NOT EXISTS conversations_buyer_idx
  ON conversations (buyer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_seller_idx
  ON conversations (seller_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL    PRIMARY KEY,
  conversation_id BIGINT       NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (conversation_id, sender_id) WHERE read_at IS NULL;

-- =========================================================
-- Shortlist (per-user saved listings)
-- =========================================================

CREATE TABLE IF NOT EXISTS shortlists (
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE shortlists
  ADD COLUMN IF NOT EXISTS ignored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS shortlists_user_idx
  ON shortlists (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shortlists_listing_idx ON shortlists (listing_id);

-- =========================================================
-- Make-an-offer
-- =========================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS offers_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS offers (
  id           BIGSERIAL    PRIMARY KEY,
  listing_id   BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER      NOT NULL CHECK (amount_cents > 0),
  note         TEXT,
  status       TEXT         NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offers_listing_idx ON offers (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offers_buyer_idx ON offers (buyer_id, created_at DESC);

-- =========================================================
-- Support tickets
-- =========================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT         NOT NULL,
  status      TEXT         NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON support_tickets (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          BIGSERIAL    PRIMARY KEY,
  ticket_id   BIGINT       NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON support_messages (ticket_id, created_at);

-- =========================================================
-- Password reset tokens
-- =========================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_change_tokens (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email   TEXT         NOT NULL,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_change_tokens_user_idx
  ON email_change_tokens (user_id, expires_at DESC);

-- =========================================================
-- Saved searches (buyer alerts)
-- =========================================================

CREATE TABLE IF NOT EXISTS saved_searches (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  params_json     JSONB        NOT NULL,
  last_emailed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON saved_searches (user_id, created_at DESC);

-- =========================================================
-- Listing analytics (per-view rows)
-- =========================================================

CREATE TABLE IF NOT EXISTS listing_views (
  id          BIGSERIAL    PRIMARY KEY,
  listing_id  BIGINT       NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewer_id   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  ip_hash     TEXT,
  viewed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS listing_views_listing_idx
  ON listing_views (listing_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS listing_views_viewer_idx
  ON listing_views (viewer_id, listing_id, viewed_at DESC);

-- =========================================================
-- Blog (admin-authored articles for SEO)
-- =========================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id           BIGSERIAL    PRIMARY KEY,
  slug         TEXT         UNIQUE NOT NULL,
  title        TEXT         NOT NULL,
  excerpt      TEXT,
  body_md      TEXT         NOT NULL DEFAULT '',
  author_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON blog_posts (published_at DESC) WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS blog_images (
  id          BIGSERIAL    PRIMARY KEY,
  post_id     BIGINT       NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  mime_type   TEXT         NOT NULL,
  bytes       BYTEA        NOT NULL,
  byte_size   INTEGER      NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_images_post_idx ON blog_images (post_id);

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS hero_image_id BIGINT
    REFERENCES blog_images(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS blog_tags (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id    BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id     BIGINT NOT NULL REFERENCES blog_tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS blog_post_tags_tag_idx
  ON blog_post_tags (tag_id, post_id);

-- One row per public blog post view. Logged from the post page via a tiny
-- client component → server action so SSR isn't blocked. Admin views are
-- excluded server-side. Roll up to total / 7d / 30d on read.
CREATE TABLE IF NOT EXISTS blog_post_views (
  id          BIGSERIAL    PRIMARY KEY,
  post_id     BIGINT       NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  viewer_id   BIGINT       REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS blog_post_views_post_time_idx
  ON blog_post_views (post_id, viewed_at DESC);

-- Blog Builder: keyword bank used to seed auto-generated articles.
CREATE TABLE IF NOT EXISTS blog_keywords (
  id            BIGSERIAL    PRIMARY KEY,
  phrase        TEXT         NOT NULL,
  intent        TEXT,
  search_volume INTEGER,
  difficulty    INTEGER,
  notes         TEXT,
  status        TEXT         NOT NULL DEFAULT 'idea',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_keywords_phrase_idx
  ON blog_keywords (LOWER(phrase));
CREATE INDEX IF NOT EXISTS blog_keywords_status_idx
  ON blog_keywords (status, created_at DESC);

-- Blog Builder: clusters group keywords sharing the same search intent.
-- One intent → one cluster → one page. Cluster name defaults to the
-- primary (highest-volume / root) keyword.
CREATE TABLE IF NOT EXISTS blog_clusters (
  id                  BIGSERIAL    PRIMARY KEY,
  name                TEXT         NOT NULL,
  intent              TEXT,
  primary_keyword_id  BIGINT       REFERENCES blog_keywords(id) ON DELETE SET NULL,
  generated_post_id   BIGINT       REFERENCES blog_posts(id)    ON DELETE SET NULL,
  model_used          TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_clusters_primary_idx
  ON blog_clusters (primary_keyword_id);

CREATE TABLE IF NOT EXISTS blog_keyword_clusters (
  cluster_id  BIGINT  NOT NULL REFERENCES blog_clusters(id) ON DELETE CASCADE,
  keyword_id  BIGINT  NOT NULL REFERENCES blog_keywords(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (cluster_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS blog_keyword_clusters_kw_idx
  ON blog_keyword_clusters (keyword_id);

ALTER TABLE blog_clusters
  ADD COLUMN IF NOT EXISTS serp_analysis_json JSONB,
  ADD COLUMN IF NOT EXISTS serp_analyzed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_gen_response_text TEXT,
  ADD COLUMN IF NOT EXISTS last_gen_error         TEXT,
  ADD COLUMN IF NOT EXISTS last_gen_at            TIMESTAMPTZ;

ALTER TABLE blog_keywords
  DROP COLUMN IF EXISTS serp_analysis_json,
  DROP COLUMN IF EXISTS serp_analyzed_at;

CREATE TABLE IF NOT EXISTS blog_cluster_images (
  id               BIGSERIAL    PRIMARY KEY,
  cluster_id       BIGINT       NOT NULL
                                REFERENCES blog_clusters(id) ON DELETE CASCADE,
  slot             INTEGER      NOT NULL DEFAULT 0,
  include_in_post  BOOLEAN      NOT NULL DEFAULT TRUE,
  source           TEXT         NOT NULL DEFAULT 'pexels',
  source_id        TEXT         NOT NULL,
  url_large        TEXT         NOT NULL,
  url_original     TEXT,
  source_url       TEXT,
  photographer     TEXT,
  photographer_url TEXT,
  alt              TEXT,
  page_offset      INTEGER      NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_cluster_images_slot_idx
  ON blog_cluster_images (cluster_id, slot);

ALTER TABLE blog_cluster_images
  ADD COLUMN IF NOT EXISTS search_phrase TEXT;

DROP TABLE IF EXISTS blog_keyword_images;

-- Site-wide settings managed from /admin/site-settings. Single row
-- keyed at id=1. Default allow_indexing=FALSE so a fresh deploy is
-- blocked from search engines until an admin flips it on.
CREATE TABLE IF NOT EXISTS site_settings (
  id              INTEGER     PRIMARY KEY CHECK (id = 1),
  allow_indexing  BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Listing-health threshold above which a listing auto-elevates to
-- trust_status='verified'. Tunable from /admin/site-settings; existing
-- listings re-evaluate on the next edit/publish so the change is
-- eventually consistent across the marketplace.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS health_threshold_verified INTEGER NOT NULL DEFAULT 75;

-- Referral programme commission. Paid (manually, out-of-band) to the
-- referrer for each friend who signs up via their /?ref=CODE link AND
-- subsequently posts at least one Verified listing. Stored in cents
-- (AUD) like the rest of the money fields. Default 0 means no payout
-- — the dashboard reports earnings as $0 until an admin sets a rate.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS referral_commission_cents INTEGER NOT NULL DEFAULT 0;

-- Maintenance window. NULL = nothing scheduled. Future timestamp =
-- countdown banner shows on every page; admins keep working. Past
-- timestamp = maintenance is active; non-admins see the polite
-- maintenance page, admins still get full access plus a banner so
-- they remember they're behind a curtain. Cleared by setting back
-- to NULL.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS maintenance_at TIMESTAMPTZ;

-- Minimum review count before a seller's rating chip appears on
-- public surfaces (browse cards, listing detail, seller profile
-- header). Below this number nothing renders, so a new seller's
-- blank slate doesn't read as negative. Default 3 — handful of
-- early reviews to lock in before broadcasting the average.
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS reviews_display_threshold INTEGER NOT NULL DEFAULT 3;

INSERT INTO site_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Blog Builder: tunable prompt budgets so admins can dial the per-call
-- token usage from the UI to stay under their Anthropic ITPM cap. Single
-- row keyed at id=1; values are characters for the markdown reference
-- budgets (clipped to the nearest paragraph break in the prompt) and
-- tokens for the per-call max_tokens reservations.
CREATE TABLE IF NOT EXISTS blog_builder_settings (
  id                 INTEGER     PRIMARY KEY CHECK (id = 1),
  voice_budget       INTEGER     NOT NULL DEFAULT 1500,
  humour_budget      INTEGER     NOT NULL DEFAULT 1500,
  opinions_budget    INTEGER     NOT NULL DEFAULT 1200,
  stats_budget       INTEGER     NOT NULL DEFAULT 1500,
  stories_budget     INTEGER     NOT NULL DEFAULT 1200,
  post_max_tokens    INTEGER     NOT NULL DEFAULT 3000,
  serp_max_tokens    INTEGER     NOT NULL DEFAULT 3500,
  cluster_max_tokens INTEGER     NOT NULL DEFAULT 1500,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO blog_builder_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Backfill existing accounts as verified — pre-rollout users shouldn't be
-- nagged after the fact.
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at);

-- Auto-derive listing title from "Designer Model" when both are present.
-- After Phase 1 the physical attrs live on `dresses`, so the lookup
-- joins through dress_id rather than reading off listings directly.
UPDATE listings
   SET title = derived.t
  FROM (
    SELECT l.id,
           TRIM(BOTH FROM CONCAT_WS(' ', de.name, dr.model)) AS t
      FROM listings l
      JOIN dresses    dr ON dr.id = l.dress_id
      LEFT JOIN designers de ON de.id = dr.designer_id
     WHERE dr.designer_id IS NOT NULL
       AND dr.model IS NOT NULL
  ) derived
 WHERE listings.id = derived.id
   AND listings.title IS DISTINCT FROM derived.t;

-- Initial schema for ebikeflip.
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql
-- (or `npm run db:setup`, which also seeds.)

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
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT         PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

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

-- =========================================================
-- Reference data (admin-managed lookups)
-- All tables share: id, sort_order, is_active. Slug+label
-- everywhere except bike_makes which uses `name` directly.
-- =========================================================

CREATE TABLE IF NOT EXISTS bike_makes (
  id          BIGSERIAL    PRIMARY KEY,
  name        TEXT         UNIQUE NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bike_categories (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bike_classes (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS frame_styles (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS frame_materials (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS wheel_sizes (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS gender_fits (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS motor_brands (
  id          BIGSERIAL    PRIMARY KEY,
  name        TEXT         UNIQUE NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS motor_types (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS drive_modes (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS brake_types (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS suspension_types (
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

CREATE TABLE IF NOT EXISTS body_positions (
  id          BIGSERIAL    PRIMARY KEY,
  slug        TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- =========================================================
-- Listing detail columns (all nullable; legacy rows survive)
-- =========================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS make_id            BIGINT  REFERENCES bike_makes(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model              TEXT,
  ADD COLUMN IF NOT EXISTS year               INTEGER,
  ADD COLUMN IF NOT EXISTS condition_id       BIGINT  REFERENCES condition_grades(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bike_class_id      BIGINT  REFERENCES bike_classes(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bike_category_id   BIGINT  REFERENCES bike_categories(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_postal    TEXT,
  ADD COLUMN IF NOT EXISTS frame_size         TEXT,
  ADD COLUMN IF NOT EXISTS frame_style_id     BIGINT  REFERENCES frame_styles(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frame_material_id  BIGINT  REFERENCES frame_materials(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gender_fit_id      BIGINT  REFERENCES gender_fits(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wheel_size_id      BIGINT  REFERENCES wheel_sizes(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_type_id BIGINT  REFERENCES suspension_types(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brake_type_id      BIGINT  REFERENCES brake_types(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motor_brand_id     BIGINT  REFERENCES motor_brands(id)       ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motor_type_id      BIGINT  REFERENCES motor_types(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motor_watts_nominal INTEGER,
  ADD COLUMN IF NOT EXISTS motor_watts_peak    INTEGER,
  ADD COLUMN IF NOT EXISTS motor_torque_nm     INTEGER,
  ADD COLUMN IF NOT EXISTS battery_wh          INTEGER,
  ADD COLUMN IF NOT EXISTS battery_voltage     INTEGER,
  ADD COLUMN IF NOT EXISTS battery_amp_hours   NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS charge_time_hours   NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS top_speed_mph       INTEGER,
  ADD COLUMN IF NOT EXISTS range_miles_min     INTEGER,
  ADD COLUMN IF NOT EXISTS range_miles_max     INTEGER,
  ADD COLUMN IF NOT EXISTS drive_mode_id       BIGINT  REFERENCES drive_modes(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mileage             INTEGER,
  ADD COLUMN IF NOT EXISTS color               TEXT,
  ADD COLUMN IF NOT EXISTS weight_lbs          NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS display_type        TEXT,
  ADD COLUMN IF NOT EXISTS drivetrain          TEXT,
  ADD COLUMN IF NOT EXISTS accessories         TEXT,
  ADD COLUMN IF NOT EXISTS modifications       TEXT,
  ADD COLUMN IF NOT EXISTS has_warranty        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS warranty_text       TEXT,
  ADD COLUMN IF NOT EXISTS has_original_receipt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS body_position_id    BIGINT  REFERENCES body_positions(id)     ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_make_id_idx       ON listings (make_id);
CREATE INDEX IF NOT EXISTS listings_category_id_idx   ON listings (bike_category_id);
CREATE INDEX IF NOT EXISTS listings_class_id_idx      ON listings (bike_class_id);

-- =========================================================
-- Reference data seed (idempotent)
-- =========================================================

INSERT INTO bike_makes (name, sort_order) VALUES
  ('Trek', 10), ('Specialized', 20), ('Cannondale', 30), ('Giant', 40),
  ('Aventon', 50), ('Rad Power', 60), ('Lectric', 70), ('Ride1Up', 80),
  ('Velotric', 90), ('Heybike', 100), ('Juiced', 110), ('Pedego', 120),
  ('Tern', 130), ('Riese & Müller', 140), ('Cube', 150), ('Orbea', 160),
  ('Bulls', 170), ('Bianchi', 180), ('BMC', 190), ('Canyon', 200),
  ('Other', 9999)
ON CONFLICT (name) DO NOTHING;

INSERT INTO bike_categories (slug, label, sort_order) VALUES
  ('commuter', 'Commuter', 10), ('cargo', 'Cargo', 20), ('folding', 'Folding', 30),
  ('cruiser', 'Cruiser', 40), ('mountain', 'Mountain', 50), ('road', 'Road', 60),
  ('gravel', 'Gravel', 70), ('hybrid', 'Hybrid', 80), ('fat-tire', 'Fat-tire', 90),
  ('step-through', 'Step-through', 100), ('trike', 'Trike', 110)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO bike_classes (slug, label, sort_order) VALUES
  ('class-1', 'Class 1 (pedal-assist, 20 mph)', 10),
  ('class-2', 'Class 2 (throttle + pedal, 20 mph)', 20),
  ('class-3', 'Class 3 (pedal-assist, 28 mph)', 30),
  ('out-of-class', 'Out-of-class / unrestricted', 40)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO frame_styles (slug, label, sort_order) VALUES
  ('step-over', 'Step-over', 10), ('step-through', 'Step-through', 20),
  ('mid-step', 'Mid-step', 30), ('folding', 'Folding', 40),
  ('recumbent', 'Recumbent', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO frame_materials (slug, label, sort_order) VALUES
  ('aluminum', 'Aluminum', 10), ('carbon', 'Carbon fiber', 20),
  ('steel', 'Steel', 30), ('chromoly', 'Chromoly steel', 40),
  ('titanium', 'Titanium', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO wheel_sizes (slug, label, sort_order) VALUES
  ('20', '20"', 10), ('24', '24"', 20), ('26', '26"', 30),
  ('27-5', '27.5"', 40), ('29', '29"', 50), ('700c', '700c', 60)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO gender_fits (slug, label, sort_order) VALUES
  ('mens', 'Men''s', 10), ('womens', 'Women''s', 20), ('unisex', 'Unisex', 30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO motor_brands (name, sort_order) VALUES
  ('Bosch', 10), ('Shimano', 20), ('Yamaha', 30), ('Brose', 40),
  ('Specialized', 50), ('Bafang', 60), ('MPF', 70),
  ('Generic / unbranded', 9000), ('Other', 9999)
ON CONFLICT (name) DO NOTHING;

INSERT INTO motor_types (slug, label, sort_order) VALUES
  ('mid-drive', 'Mid-drive', 10),
  ('rear-hub', 'Rear hub', 20),
  ('front-hub', 'Front hub', 30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO drive_modes (slug, label, sort_order) VALUES
  ('pedal-assist', 'Pedal-assist only', 10),
  ('throttle', 'Throttle only', 20),
  ('both', 'Pedal-assist + throttle', 30)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO brake_types (slug, label, sort_order) VALUES
  ('hydraulic-disc', 'Hydraulic disc', 10),
  ('mechanical-disc', 'Mechanical disc', 20),
  ('rim', 'Rim', 30), ('drum', 'Drum', 40), ('coaster', 'Coaster', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO suspension_types (slug, label, sort_order) VALUES
  ('rigid', 'None (rigid)', 10),
  ('hardtail', 'Front (hardtail)', 20),
  ('full', 'Full', 30),
  ('rear-only', 'Rear only', 40)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO condition_grades (slug, label, sort_order) VALUES
  ('like-new', 'Like new', 10),
  ('excellent', 'Excellent', 20),
  ('good', 'Good', 30),
  ('fair', 'Fair', 40),
  ('for-parts', 'For parts', 50)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO body_positions (slug, label, sort_order) VALUES
  ('upright', 'Upright', 10),
  ('forward', 'Forward', 20),
  ('aggressive', 'Aggressive', 30)
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

-- Backfill existing accounts as verified — pre-rollout users shouldn't be
-- nagged after the fact.
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at);

-- Switch existing listings to the auto-derived "Year Make Model" title
-- format. Skips rows where year/make/model aren't all present (drafts).
UPDATE listings
   SET title = derived.t
  FROM (
    SELECT l.id,
           TRIM(BOTH FROM CONCAT_WS(' ', l.year::text, mk.name, l.model)) AS t
      FROM listings l
      LEFT JOIN bike_makes mk ON mk.id = l.make_id
     WHERE l.year IS NOT NULL
       AND l.make_id IS NOT NULL
       AND l.model IS NOT NULL
  ) derived
 WHERE listings.id = derived.id
   AND listings.title IS DISTINCT FROM derived.t;

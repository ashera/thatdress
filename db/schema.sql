-- Initial schema for ebikeflip.
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql
-- (or `npm run db:setup`, which also seeds.)

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL    PRIMARY KEY,
  email         TEXT         UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

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
  ADD COLUMN IF NOT EXISTS seller_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS listings_seller_id_idx ON listings (seller_id);

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

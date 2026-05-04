-- Sample listings for local development.
-- Idempotent: only inserts if the table is empty.

INSERT INTO listings (title, description, price_cents)
SELECT * FROM (VALUES
  ('Vera Wang Hayley',          'Floor-length tulle ball gown, ivory. Worn once, dry-cleaned.',         189900),
  ('Marchesa Aurora',           'Sequined long-sleeve gown, navy. Black-tie ready.',                   159900),
  ('Self-Portrait Azaelea',     'Lace cocktail dress, blush pink. Size US 6.',                          39900),
  ('Carolina Herrera Olivia',   'Silk satin midi, emerald. Bridesmaid or wedding-guest.',               89900),
  ('Reformation Juliette',      'Floral chiffon mini, ivy print. Like-new with original tags.',         24900)
) AS v(title, description, price_cents)
WHERE NOT EXISTS (SELECT 1 FROM listings);

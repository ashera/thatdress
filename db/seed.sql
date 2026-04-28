-- Sample listings for local development.
-- Idempotent: only inserts if the table is empty.

INSERT INTO listings (title, description, price_cents)
SELECT * FROM (VALUES
  ('Specialized Turbo Vado 4.0',     'Commuter ebike, 2022, 1,200 mi. New tires.',         189900),
  ('Rad Power RadRunner Plus',       'Cargo ebike with passenger kit. Excellent battery.',  159900),
  ('Aventon Level.2',                'Mid-step, hydraulic brakes, throttle + pedal assist.',129900),
  ('Trek Allant+ 7',                 'Bosch motor, 500Wh, lightly used.',                   249900),
  ('Lectric XP 3.0',                 'Folding ebike. Two batteries included.',               89900)
) AS v(title, description, price_cents)
WHERE NOT EXISTS (SELECT 1 FROM listings);

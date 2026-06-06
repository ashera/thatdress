# Sample listing images

This folder supplies the photos used by the local **Sample Data** seeder
(`src/lib/sample-data.ts`, admin → Sample Data).

- **Drop dress photos here** (`.jpg` / `.jpeg` / `.png` / `.webp`). The
  seeder reads them in filename order and cycles through them across the
  sample listings — use your own product shots. Fully offline; no network.
- **If this folder has no images**, the seeder falls back to a generated
  solid-colour placeholder per listing.

These images are only ever used for local sample data — nothing here is
served in production. Add as many or as few as you like; the seeder cycles
whatever is present.

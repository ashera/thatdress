import "server-only";
import { query } from "@/lib/db";

export type SiteSettings = {
  /** Master switch for search-engine indexing. When false the site
   *  emits robots: noindex,nofollow on every page and Disallow:/ in
   *  /robots.txt. Default false so new deployments are blocked until
   *  an admin explicitly opens them up. */
  allowIndexing: boolean;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  allowIndexing: false,
};

type Row = {
  allow_indexing: boolean;
};

export async function loadSiteSettings(): Promise<SiteSettings> {
  try {
    const r = await query<Row>(
      `SELECT allow_indexing FROM site_settings WHERE id = 1 LIMIT 1`,
    );
    const row = r.rows[0];
    if (!row) return DEFAULT_SITE_SETTINGS;
    return { allowIndexing: row.allow_indexing };
  } catch {
    // If the DB is unreachable, fall safe (block indexing) so we don't
    // accidentally let crawlers in during an outage / migration.
    return DEFAULT_SITE_SETTINGS;
  }
}

export async function updateSiteSettings(next: SiteSettings): Promise<void> {
  await query(
    `INSERT INTO site_settings (id, allow_indexing, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET
       allow_indexing = EXCLUDED.allow_indexing,
       updated_at     = NOW()`,
    [next.allowIndexing],
  );
}

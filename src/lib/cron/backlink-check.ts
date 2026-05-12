import "server-only";
import { query } from "@/lib/db";

const BATCH_LIMIT = 10;
const RECHECK_INTERVAL_DAYS = 7;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "frockd-link-checker/1.0 (+https://www.frockd.com.au)";

export type BacklinkCheckStats = {
  /** Rows selected as due for re-check on this run. */
  candidates: number;
  /** Rows where the fetch succeeded and we could evaluate the link. */
  checked: number;
  /** Of `checked`, the target URL was still present on the source page. */
  stillAlive: number;
  /** Of `checked`, the target URL was missing — status was flipped to 'dead'. */
  nowDead: number;
  /** Fetch failures (network, timeout, non-200). last_checked_at is
   *  not bumped on errors so the next run retries. */
  errors: number;
};

type Row = {
  id: string;
  source_url: string;
  target_url: string;
  status: string;
};

/**
 * Iterate a small batch of backlinks whose last_checked_at is
 * either NULL or older than the recheck interval, fetch each
 * source_url, and decide whether the link still exists.
 *
 * Existence check: we look for any href in the fetched HTML that
 * points at the target's host + path. Covers UTM-tracked variants
 * and protocol switches (http → https) without needing a full
 * HTML parser. False positives are possible (someone could mention
 * the URL in body text without linking) — acceptable for an MVP;
 * the admin can manually flip the status from the list page.
 *
 * Rate-limited at BATCH_LIMIT per call so a single admin page-load
 * piggyback doesn't hammer external sites or take forever. The
 * SQL filter ensures the same row isn't re-checked within
 * RECHECK_INTERVAL_DAYS even across multiple loads.
 */
export async function runBacklinkCheckBatch(): Promise<BacklinkCheckStats> {
  let rows: Row[];
  try {
    const r = await query<Row>(
      `SELECT id::text, source_url, target_url, status
         FROM backlinks
        WHERE status IN ('alive', 'pending')
          AND (
            last_checked_at IS NULL
            OR last_checked_at < NOW() - INTERVAL '${RECHECK_INTERVAL_DAYS} days'
          )
        ORDER BY last_checked_at NULLS FIRST,
                 discovered_at ASC
        LIMIT $1`,
      [BATCH_LIMIT],
    );
    rows = r.rows;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[backlink-check] select failed", e);
    return {
      candidates: 0,
      checked: 0,
      stillAlive: 0,
      nowDead: 0,
      errors: 0,
    };
  }

  const stats: BacklinkCheckStats = {
    candidates: rows.length,
    checked: 0,
    stillAlive: 0,
    nowDead: 0,
    errors: 0,
  };

  for (const row of rows) {
    const result = await checkOne(row);
    if (result === "error") {
      stats.errors++;
      continue;
    }
    stats.checked++;
    if (result === "alive") {
      stats.stillAlive++;
      // Stamp last_checked_at; keep status as-is (alive or pending).
      // If a 'pending' row resolves alive we promote it.
      await query(
        `UPDATE backlinks
            SET status          = 'alive',
                last_checked_at = NOW(),
                updated_at      = NOW()
          WHERE id = $1::bigint`,
        [row.id],
      );
    } else {
      stats.nowDead++;
      await query(
        `UPDATE backlinks
            SET status          = 'dead',
                last_checked_at = NOW(),
                updated_at      = NOW()
          WHERE id = $1::bigint`,
        [row.id],
      );
    }
  }

  return stats;
}

type CheckResult = "alive" | "dead" | "error";

async function checkOne(row: Row): Promise<CheckResult> {
  let html: string;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(row.source_url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return "error";
    // Cap the body size — some content sites stream huge HTML.
    // 1MB is enough to scan for href links on most pages.
    const text = await res.text();
    html = text.length > 1_000_000 ? text.slice(0, 1_000_000) : text;
  } catch {
    return "error";
  }
  return linkPresent(html, row.target_url) ? "alive" : "dead";
}

/**
 * Look for any anchor tag whose href references the same host +
 * path as the target URL. Forgiving: ignores protocol differences,
 * trailing slashes, query strings, and surrounding whitespace.
 */
export function linkPresent(html: string, targetUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  const targetHost = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const targetPath = parsed.pathname.replace(/\/+$/, "") || "/";

  // Extract every href attribute from the document.
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    // Resolve relative URLs against the source page (best-effort —
    // any relative href on an external page that resolves to our
    // host wouldn't make sense, but we still want absolute matching
    // to work cleanly).
    let candidate: URL;
    try {
      candidate = new URL(raw, "https://placeholder.invalid/");
    } catch {
      continue;
    }
    const candHost = candidate.hostname.replace(/^www\./, "").toLowerCase();
    if (candHost !== targetHost) continue;
    const candPath = candidate.pathname.replace(/\/+$/, "") || "/";
    if (candPath === targetPath) return true;
  }
  return false;
}

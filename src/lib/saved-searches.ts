import "server-only";
import { query } from "@/lib/db";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";

const CURRENT_YEAR = new Date().getUTCFullYear();
const MAX_YEAR = CURRENT_YEAR + 1;

type Params = Record<string, unknown>;

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string");
  if (typeof v === "string" && v.length > 0) return [v];
  return [];
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function validIds(arr: string[]): string[] {
  return arr.filter((s) => /^\d+$/.test(s));
}
function validInt(s: string | null, min: number, max: number): number | null {
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Translate saved-search params into a WHERE / params array suitable for
 * scanning the listings table. Always restricts to is_published = TRUE.
 * Mode controls sold-state: for-sale (default) excludes sold; sold matches
 * only sold; shortlist is ignored here (saved searches can't be region-
 * locked; users get all regions in their email digest).
 */
export function buildSavedSearchWhere(params: Params): {
  where: string[];
  vals: unknown[];
} {
  const where: string[] = ["l.is_published = TRUE"];
  const vals: unknown[] = [];

  const mode = asStr(params.mode);
  if (mode === "sold") where.push("l.sold_at IS NOT NULL");
  else where.push("l.sold_at IS NULL");

  const q = asStr(params.q)?.slice(0, 120);
  if (q) {
    vals.push(`%${escapeLike(q)}%`);
    const n = vals.length;
    where.push(
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR l.model ILIKE $${n} ESCAPE '\\' OR mk.name ILIKE $${n} ESCAPE '\\')`,
    );
  }

  const addArrIn = (col: string, ids: string[]) => {
    if (ids.length === 0) return;
    vals.push(ids.map(Number));
    where.push(`${col} = ANY($${vals.length}::bigint[])`);
  };
  addArrIn("l.make_id", validIds(asArray(params.make_id)));
  addArrIn("l.bike_class_id", validIds(asArray(params.bike_class_id)));
  addArrIn("l.bike_category_id", validIds(asArray(params.bike_category_id)));
  addArrIn("l.condition_id", validIds(asArray(params.condition_id)));

  const minPrice = validInt(asStr(params.min_price), 0, 10_000_000);
  if (minPrice != null) {
    vals.push(minPrice * 100);
    where.push(`l.price_cents >= $${vals.length}`);
  }
  const maxPrice = validInt(asStr(params.max_price), 0, 10_000_000);
  if (maxPrice != null) {
    vals.push(maxPrice * 100);
    where.push(`l.price_cents <= $${vals.length}`);
  }
  const minYear = validInt(asStr(params.min_year), 1990, MAX_YEAR);
  if (minYear != null) {
    vals.push(minYear);
    where.push(`l.year >= $${vals.length}`);
  }
  const maxYear = validInt(asStr(params.max_year), 1990, MAX_YEAR);
  if (maxYear != null) {
    vals.push(maxYear);
    where.push(`l.year <= $${vals.length}`);
  }

  return { where, vals };
}

/** Render a search's params as a short human-readable summary. */
export function describeSearch(params: Params): string {
  const parts: string[] = [];
  if (asStr(params.q)) parts.push(`"${asStr(params.q)}"`);
  const makes = validIds(asArray(params.make_id)).length;
  if (makes > 0) parts.push(`${makes} make${makes === 1 ? "" : "s"}`);
  const cats = validIds(asArray(params.bike_category_id)).length;
  if (cats > 0) parts.push(`${cats} categor${cats === 1 ? "y" : "ies"}`);
  const cls = validIds(asArray(params.bike_class_id)).length;
  if (cls > 0) parts.push(`${cls} class${cls === 1 ? "" : "es"}`);
  const minP = asStr(params.min_price);
  const maxP = asStr(params.max_price);
  if (minP || maxP) parts.push(`$${minP ?? "0"}–$${maxP ?? "any"}`);
  const minY = asStr(params.min_year);
  const maxY = asStr(params.max_year);
  if (minY || maxY) parts.push(`${minY ?? "any"}–${maxY ?? "now"}`);
  if (params.mode === "sold") parts.push("sold");
  return parts.length > 0 ? parts.join(" · ") : "no filters";
}

type Match = {
  id: string;
  title: string;
  price_cents: number;
  make_name: string | null;
  model: string | null;
  year: number | null;
};

export async function findNewMatches(
  params: Params,
  sinceIso: string,
  limit: number,
): Promise<Match[]> {
  const { where, vals } = buildSavedSearchWhere(params);
  vals.push(sinceIso);
  where.push(`l.created_at > $${vals.length}::timestamptz`);
  vals.push(limit);
  const limitParam = vals.length;

  const result = await query<Match>(
    `SELECT l.id::text,
            l.title,
            l.price_cents,
            mk.name AS make_name,
            l.model,
            l.year
       FROM listings l
       LEFT JOIN bike_makes mk ON mk.id = l.make_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.created_at DESC
      LIMIT $${limitParam}`,
    vals,
  );
  return result.rows;
}

export async function emailSavedSearchDigest(opts: {
  to: string;
  searchName: string;
  searchId: string;
  matches: Match[];
  baseUrl: string;
}): Promise<void> {
  const { to, searchName, searchId, matches, baseUrl } = opts;
  if (matches.length === 0) return;

  const priceFmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const subject = `${matches.length} new match${matches.length === 1 ? "" : "es"} for "${searchName}"`;
  const rows = matches
    .map((m) => {
      const sub = [m.year, m.make_name, m.model].filter(Boolean).join(" · ");
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e9e5df;">
            <a href="${baseUrl}/listings/${m.id}" style="color:#1c1816;text-decoration:none;font-weight:600;">${escapeHtml(m.title)}</a>
            ${sub ? `<div style="font-size:13px;color:#7a7470;margin-top:2px;">${escapeHtml(sub)}</div>` : ""}
            <div style="font-size:14px;color:#3a342f;margin-top:4px;">${priceFmt.format(m.price_cents / 100)}</div>
          </td>
        </tr>`;
    })
    .join("");

  await sendEmail({
    to,
    subject,
    html: emailLayout({
      preheader: subject,
      heading: subject,
      body: `
        <p>New listings matching your saved search <strong>${escapeHtml(searchName)}</strong>:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${rows}</table>
        <p style="margin-top:24px;">
          <a href="${baseUrl}/alerts/${searchId}" style="color:#bd5e1c;text-decoration:underline;">Manage this saved search →</a>
        </p>
      `,
    }),
    text: `New matches for "${searchName}":\n\n${matches
      .map(
        (m) => `${m.title} — ${priceFmt.format(m.price_cents / 100)}\n${baseUrl}/listings/${m.id}`,
      )
      .join("\n\n")}`,
  });
}

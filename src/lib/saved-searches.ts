import "server-only";
import { query } from "@/lib/db";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";

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
      `(l.title ILIKE $${n} ESCAPE '\\' OR l.description ILIKE $${n} ESCAPE '\\' OR l.model ILIKE $${n} ESCAPE '\\' OR d.name ILIKE $${n} ESCAPE '\\')`,
    );
  }

  const addArrIn = (col: string, ids: string[]) => {
    if (ids.length === 0) return;
    vals.push(ids.map(Number));
    where.push(`${col} = ANY($${vals.length}::bigint[])`);
  };
  addArrIn("l.designer_id", validIds(asArray(params.designer_id)));
  addArrIn("l.occasion_id", validIds(asArray(params.occasion_id)));
  addArrIn("l.silhouette_id", validIds(asArray(params.silhouette_id)));
  addArrIn("l.size_id", validIds(asArray(params.size_id)));
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

  return { where, vals };
}

/** Render a search's params as a short human-readable summary. */
export function describeSearch(params: Params): string {
  const parts: string[] = [];
  if (asStr(params.q)) parts.push(`"${asStr(params.q)}"`);
  const designers = validIds(asArray(params.designer_id)).length;
  if (designers > 0) parts.push(`${designers} designer${designers === 1 ? "" : "s"}`);
  const occasions = validIds(asArray(params.occasion_id)).length;
  if (occasions > 0) parts.push(`${occasions} occasion${occasions === 1 ? "" : "s"}`);
  const sizes = validIds(asArray(params.size_id)).length;
  if (sizes > 0) parts.push(`${sizes} size${sizes === 1 ? "" : "s"}`);
  const minP = asStr(params.min_price);
  const maxP = asStr(params.max_price);
  if (minP || maxP) parts.push(`$${minP ?? "0"}–$${maxP ?? "any"}`);
  if (params.mode === "sold") parts.push("sold");
  return parts.length > 0 ? parts.join(" · ") : "no filters";
}

type Match = {
  id: string;
  title: string;
  price_cents: number;
  designer_name: string | null;
  model: string | null;
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
            d.name AS designer_name,
            l.model
       FROM listings l
       LEFT JOIN designers d ON d.id = l.designer_id
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
      const sub = [m.designer_name, m.model].filter(Boolean).join(" · ");
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

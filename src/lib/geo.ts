import "server-only";
import { cookies, headers } from "next/headers";

const ANON_LOC_COOKIE = "anon_loc";

export async function getAnonymousLocation(): Promise<string | null> {
  // Middleware forwards a fresh value via this header on the very first
  // visit, before the response cookie has reached the browser.
  const h = await headers();
  const fromHeader = h.get("x-anon-location");
  if (fromHeader) return fromHeader;

  const jar = await cookies();
  const v = jar.get(ANON_LOC_COOKIE)?.value;
  return v && v.length > 0 ? v : null;
}

export type IpLocation = {
  city: string | null;
  region: string | null;
  postal: string | null;
  country: string | null;
  display: string;
};

const PRIVATE_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc00:|fe80:)/i;

function getClientIp(h: Headers): string | null {
  // x-forwarded-for: client, proxy1, proxy2 — first entry is the original client
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? null;
}

type IpapiResponse = {
  city?: string;
  region?: string;
  region_code?: string;
  postal?: string;
  country_name?: string;
  error?: boolean;
  reason?: string;
};

export async function suggestLocationFromIp(): Promise<IpLocation | null> {
  let ip: string | null;
  try {
    const h = await headers();
    ip = getClientIp(h);
  } catch {
    return null;
  }
  if (!ip || PRIVATE_RE.test(ip)) return null;

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: { "User-Agent": "ebikeflip/1.0" },
      // Cache by URL (per IP) for a day to stay well under the free quota.
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IpapiResponse;
    if (data.error) return null;

    const city = data.city ?? null;
    const region = data.region_code ?? data.region ?? null;
    const postal = data.postal ?? null;
    const country = data.country_name ?? null;

    let display = "";
    if (city && region) display = `${city}, ${region}`;
    else if (city) display = city;
    else if (postal) display = postal;
    else if (region) display = region;

    if (!display) return null;

    return { city, region, postal, country, display };
  } catch {
    return null;
  }
}

import { NextResponse, type NextRequest } from "next/server";

const ANON_LOC_COOKIE = "anon_loc";
const SESSION_COOKIE = "session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

const REFERRAL_COOKIE = "frockd_ref";
const REFERRAL_PARAM = "ref";
const REFERRAL_MAX_LEN = 16;
const REFERRAL_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Capture a `?ref=CODE` query param into a cookie so registration
 *  can credit the referrer when the visitor signs up later. We don't
 *  validate the code here — that happens server-side at registration
 *  time against the users table. Just sanity-check shape (alphanum,
 *  ≤16 chars) so we can't be tricked into setting a giant cookie. */
function maybeSetReferralCookie(req: NextRequest, res: NextResponse) {
  const raw = req.nextUrl.searchParams.get(REFERRAL_PARAM);
  if (!raw) return;
  const code = raw.trim().toUpperCase().slice(0, REFERRAL_MAX_LEN);
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return;
  // Don't overwrite an existing cookie — first referrer wins so the
  // visitor doesn't get re-attributed by re-clicking a different link
  // ten minutes before sign-up.
  if (req.cookies.has(REFERRAL_COOKIE)) return;
  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFERRAL_MAX_AGE,
  });
}

const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc00:|fe80:)/i;

type IpapiResponse = {
  city?: string;
  region?: string;
  region_code?: string;
  postal?: string;
  error?: boolean;
};

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}

function formatDisplay(d: IpapiResponse): string | null {
  const region = d.region_code || d.region;
  if (d.city && region) return `${d.city}, ${region}`;
  if (d.city) return d.city;
  if (d.postal) return d.postal;
  if (region) return region;
  return null;
}

function passthrough(req: NextRequest): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  maybeSetReferralCookie(req, res);
  return res;
}

export async function middleware(req: NextRequest) {
  // Skip IP geo when we already have a session (logged in) or a cached anon
  // location, but still forward x-pathname so RegionGate can read it.
  if (req.cookies.has(SESSION_COOKIE) || req.cookies.has(ANON_LOC_COOKIE)) {
    return passthrough(req);
  }

  const ip = clientIp(req);
  if (!ip || PRIVATE_IP_RE.test(ip)) {
    return passthrough(req);
  }

  let display: string | null = null;
  try {
    const r = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      { headers: { "User-Agent": "frockd/1.0" } },
    );
    if (r.ok) {
      const data = (await r.json()) as IpapiResponse;
      if (!data.error) display = formatDisplay(data);
    }
  } catch {
    // Swallow: never block the page on an external lookup failure.
  }

  // Forward via request header so the *current* render can read it.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  if (display) requestHeaders.set("x-anon-location", display);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  maybeSetReferralCookie(req, res);
  if (display) {
    res.cookies.set(ANON_LOC_COOKIE, display, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  } else {
    // Empty cookie blocks re-attempts for an hour after a failed lookup.
    res.cookies.set(ANON_LOC_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
  }
  return res;
}

export const config = {
  // Skip Next internals, API routes, and any URL that looks like a static asset.
  matcher: ["/((?!api|_next|favicon|.*\\..*).*)"],
};

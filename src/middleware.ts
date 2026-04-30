import { NextResponse, type NextRequest } from "next/server";

const ANON_LOC_COOKIE = "anon_loc";
const SESSION_COOKIE = "session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

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

export async function middleware(req: NextRequest) {
  // Skip if we already have a session (logged in) or a cached anon location.
  if (
    req.cookies.has(SESSION_COOKIE) ||
    req.cookies.has(ANON_LOC_COOKIE)
  ) {
    return NextResponse.next();
  }

  const ip = clientIp(req);
  if (!ip || PRIVATE_IP_RE.test(ip)) {
    return NextResponse.next();
  }

  let display: string | null = null;
  try {
    const r = await fetch(
      `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
      { headers: { "User-Agent": "ebikeflip/1.0" } },
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
  if (display) requestHeaders.set("x-anon-location", display);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
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

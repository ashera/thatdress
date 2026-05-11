import { NextResponse, type NextRequest } from "next/server";

/**
 * Clean referral-link redirect. /r/SARAH-K reads nicer in a text
 * message than /?ref=SARAH-K, but the actual attribution still
 * runs through the existing middleware that watches for ?ref=
 * and stamps the cookie. This handler just validates the shape
 * of the code and bounces to /?ref=CODE — the browser then makes
 * a fresh request through middleware which sets the cookie.
 *
 * Sanity-checks the code so a typo / scraper doesn't end up with
 * a 16-character cookie of garbage; the registration path
 * re-validates against the users table.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: rawCode } = await ctx.params;
  const raw = (rawCode ?? "").trim().toUpperCase().slice(0, 16);
  if (!/^[A-Z0-9-]{3,16}$/.test(raw)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Strip dashes for the cookie value — they're allowed in URLs
  // for readability (sarah-k) but the cookie / DB code stores the
  // alphanumeric form.
  const code = raw.replace(/-/g, "");
  if (!/^[A-Z0-9]{4,16}$/.test(code)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const target = new URL("/", req.url);
  target.searchParams.set("ref", code);
  return NextResponse.redirect(target);
}

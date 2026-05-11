import { NextResponse } from "next/server";
import { getShareBaseUrl } from "@/lib/email";

/**
 * Clean referral-link redirect. /r/SARAH-K reads nicer in a text
 * message than /?ref=SARAH-K, but the actual attribution still
 * runs through the existing middleware that watches for ?ref=
 * and stamps the cookie. This handler just validates the shape
 * of the code and bounces to /?ref=CODE — the browser then makes
 * a fresh request through middleware which sets the cookie.
 *
 * Why build the redirect from getShareBaseUrl() instead of
 * req.url: behind Railway's TLS proxy, Node's request URL points
 * at the internal listener (localhost:PORT) even though the
 * client connected to www.frockd.com.au. `new URL("/", req.url)`
 * would produce a redirect to localhost, breaking the link the
 * recipient just tapped. Pinning the target to the configured
 * public domain side-steps the proxy entirely.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: rawCode } = await ctx.params;
  const raw = (rawCode ?? "").trim().toUpperCase().slice(0, 16);
  const base = getShareBaseUrl();
  if (!/^[A-Z0-9-]{3,16}$/.test(raw)) {
    return NextResponse.redirect(base);
  }
  // Strip dashes for the cookie value — they're allowed in URLs
  // for readability (sarah-k) but the cookie / DB code stores the
  // alphanumeric form.
  const code = raw.replace(/-/g, "");
  if (!/^[A-Z0-9]{4,16}$/.test(code)) {
    return NextResponse.redirect(base);
  }
  return NextResponse.redirect(`${base}/?ref=${code}`);
}

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyEmailByToken } from "@/lib/email-verify";
import { getBaseUrl } from "@/lib/email";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const result = await verifyEmailByToken(token);

  // Build the redirect target from the proxy host/proto headers, NOT
  // request.url — behind a reverse proxy (Railway, etc.) the latter
  // points at the internal Node origin (e.g. http://localhost:8080),
  // and that internal URL ends up in the Location header. The
  // recipient's browser then tries to open it and gets
  // "localhost refused to connect".
  const baseUrl = await getBaseUrl();
  const dest = new URL("/verify", baseUrl);
  if (result.ok) {
    revalidatePath("/", "layout");
    dest.searchParams.set("status", "ok");
  } else {
    dest.searchParams.set("status", result.reason);
  }
  return NextResponse.redirect(dest);
}

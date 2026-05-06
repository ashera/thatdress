import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { confirmEmailChangeByToken } from "@/lib/email-change";
import { getBaseUrl } from "@/lib/email";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const result = await confirmEmailChangeByToken(token);

  // request.url is the *internal* origin behind a reverse proxy and
  // would put a localhost URL into the redirect Location. Build from
  // the proxy host/proto headers instead via getBaseUrl().
  const baseUrl = await getBaseUrl();
  const dest = new URL("/email-change", baseUrl);
  if (result.ok) {
    revalidatePath("/", "layout");
    dest.searchParams.set("status", "ok");
    dest.searchParams.set("email", result.newEmail);
  } else {
    dest.searchParams.set("status", result.reason);
  }
  return NextResponse.redirect(dest);
}

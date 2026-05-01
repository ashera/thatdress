import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { confirmEmailChangeByToken } from "@/lib/email-change";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const result = await confirmEmailChangeByToken(token);

  const dest = new URL("/email-change", request.url);
  if (result.ok) {
    revalidatePath("/", "layout");
    dest.searchParams.set("status", "ok");
    dest.searchParams.set("email", result.newEmail);
  } else {
    dest.searchParams.set("status", result.reason);
  }
  return NextResponse.redirect(dest);
}

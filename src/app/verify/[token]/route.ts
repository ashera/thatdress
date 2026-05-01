import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyEmailByToken } from "@/lib/email-verify";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const result = await verifyEmailByToken(token);

  const dest = new URL("/verify", request.url);
  if (result.ok) {
    revalidatePath("/", "layout");
    dest.searchParams.set("status", "ok");
  } else {
    dest.searchParams.set("status", result.reason);
  }
  return NextResponse.redirect(dest);
}

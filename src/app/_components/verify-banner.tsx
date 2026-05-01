import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resendVerificationEmail } from "@/lib/actions/email-verify";
import { Button } from "./ui";

const BYPASS_PREFIXES = ["/verify"];

export async function VerifyBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified) return null;

  // Don't render the banner on the /verify success page itself.
  const h = await headers();
  const path = h.get("x-pathname") ?? "/";
  if (BYPASS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <div className="verify-banner">
      <div className="verify-banner-text">
        <strong>Verify your email.</strong>{" "}
        <span>
          We sent a confirmation link to <em>{user.email}</em>. Check your
          inbox to finish setup.
        </span>
      </div>
      <form action={resendVerificationEmail}>
        <Button type="submit" variant="ghost" size="sm">
          Resend
        </Button>
      </form>
    </div>
  );
}

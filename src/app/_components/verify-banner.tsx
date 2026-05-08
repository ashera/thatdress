import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resendVerificationEmail } from "@/lib/actions/email-verify";
import { Button } from "./ui";

const BYPASS_PREFIXES = ["/verify"];
const VERIFY_FLASH_COOKIE = "verify_flash";

export async function VerifyBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified) return null;

  // Don't render the banner on the /verify success page itself.
  const h = await headers();
  const path = h.get("x-pathname") ?? "/";
  if (BYPASS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return null;
  }

  // Read the resend flash. Cookie expires on its own (short TTL set
  // by the action), so we don't need to delete it here — server
  // components can't anyway. The 'throttled' state happens when the
  // user clicks Resend less than a minute after the previous send.
  const jar = await cookies();
  const flash = jar.get(VERIFY_FLASH_COOKIE)?.value;

  if (flash === "sent") {
    return (
      <div
        className="verify-banner"
        style={{
          background: "var(--ok-100, #d1fae5)",
          borderColor: "#86efac",
        }}
        role="status"
        aria-live="polite"
      >
        <div className="verify-banner-text">
          <strong>Verification email on its way.</strong>{" "}
          <span>
            We&rsquo;ve sent a fresh confirmation link to{" "}
            <em>{user.email}</em>. Check your inbox (and spam folder)
            within a minute or two.
          </span>
        </div>
      </div>
    );
  }

  if (flash === "throttled") {
    return (
      <div
        className="verify-banner"
        role="status"
        aria-live="polite"
      >
        <div className="verify-banner-text">
          <strong>Hang on a moment.</strong>{" "}
          <span>
            We sent a verification email to <em>{user.email}</em> very
            recently. Wait a minute and try Resend again if it
            hasn&rsquo;t arrived.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="verify-banner">
      <div className="verify-banner-text">
        <strong>Verify your email.</strong>{" "}
        <span>
          We sent a confirmation link to <em>{user.email}</em>. Check
          your inbox to finish setup — or hit Resend if it never
          arrived.
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

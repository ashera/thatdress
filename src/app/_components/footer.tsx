import { cookies } from "next/headers";
import Link from "next/link";
import { buildInfo } from "@/lib/build-info";
import { lookupReferrerDisplay, REFERRAL_COOKIE } from "@/lib/referral";

/**
 * Site-wide footer. Picks up the referral cookie (set by middleware
 * when a visitor lands via /?ref= or /r/[code]) and surfaces the
 * referrer's name + code so the visitor can see who invited them.
 * Silently hides the chip when there's no cookie or the code
 * doesn't resolve to an active user.
 */
export async function Footer() {
  const cookieStore = await cookies();
  const refCode = cookieStore.get(REFERRAL_COOKIE)?.value ?? null;
  const referrer = refCode ? await lookupReferrerDisplay(refCode) : null;

  return (
    <footer className="footer">
      <div className="row">
        <span>frockd · peer-to-peer formal-dress marketplace</span>
        <span className="meta">
          {referrer && (
            <>
              <span title="You arrived via this person's invite">
                Invited by <strong>{referrer.displayName}</strong> (
                {referrer.code})
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <Link href="/privacy" style={{ color: "inherit" }}>
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <span>v{buildInfo.version}</span>
          <span aria-hidden>·</span>
          <span title={buildInfo.commitFull}>{buildInfo.commit}</span>
        </span>
      </div>
    </footer>
  );
}

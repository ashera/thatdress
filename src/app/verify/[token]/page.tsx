import Link from "next/link";
import { verifyEmailByToken } from "@/lib/email-verify";
import { ButtonLink } from "../../_components/ui";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  invalid: "This verification link doesn't look right. It may have been mistyped.",
  expired: "This link has expired. Verification links last 24 hours.",
  used: "This link has already been used. Your email is already verified.",
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await verifyEmailByToken(token);

  return (
    <div className="page auth-page">
      <main style={{ width: "100%", maxWidth: 440 }}>
        <div className="form-card">
          {result.ok ? (
            <>
              <p className="eyebrow">All set</p>
              <h1>Email verified</h1>
              <p
                className="sub"
                style={{ marginTop: 8, marginBottom: "var(--s-5)" }}
              >
                Thanks for confirming. You&rsquo;re ready to use everything
                ebikeflip has to offer.
              </p>
              <ButtonLink href="/listings" variant="primary" iconRight="arrow">
                Browse listings
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="eyebrow">Verification</p>
              <h1>Couldn&rsquo;t verify</h1>
              <p
                className="sub"
                style={{ marginTop: 8, marginBottom: "var(--s-5)" }}
              >
                {REASONS[result.reason]}
              </p>
              <ButtonLink href="/" variant="primary" iconRight="arrow">
                Back home
              </ButtonLink>
              {result.reason === "expired" && (
                <p
                  className="sub"
                  style={{ marginTop: "var(--s-4)", fontSize: 13 }}
                >
                  Logged in already? <Link href="/">Resend</Link> the email
                  from the banner at the top.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

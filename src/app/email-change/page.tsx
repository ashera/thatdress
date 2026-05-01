import { ButtonLink } from "../_components/ui";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  invalid: "This confirmation link doesn't look right. It may have been mistyped.",
  expired: "This link has expired. Email-change links last 24 hours.",
  used: "This link has already been used or was superseded by a newer request.",
  taken: "That email is now in use on another account. Try a different address.",
};

export default async function EmailChangeResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; email?: string }>;
}) {
  const { status, email } = await searchParams;
  const ok = status === "ok";
  const reason = !ok && status ? REASONS[status] : null;

  return (
    <div className="page auth-page">
      <main style={{ width: "100%", maxWidth: 440 }}>
        <div className="form-card">
          {ok ? (
            <>
              <p className="eyebrow">All set</p>
              <h1>Email updated</h1>
              <p
                className="sub"
                style={{ marginTop: 8, marginBottom: "var(--s-5)" }}
              >
                Your login email is now <strong>{email}</strong>. Use it
                next time you sign in.
              </p>
              <ButtonLink href="/profile" variant="primary" iconRight="arrow">
                Back to profile
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="eyebrow">Email change</p>
              <h1>Couldn&rsquo;t update</h1>
              <p
                className="sub"
                style={{ marginTop: 8, marginBottom: "var(--s-5)" }}
              >
                {reason ?? "Something went wrong with the confirmation link."}
              </p>
              <ButtonLink href="/profile" variant="primary" iconRight="arrow">
                Back to profile
              </ButtonLink>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

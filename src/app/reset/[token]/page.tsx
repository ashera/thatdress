import Link from "next/link";
import { resetPassword } from "@/lib/actions/password-reset";
import { Button, Field, Input } from "../../_components/ui";
import { PasswordRules } from "../../_components/password-rules";
import { PASSWORD_RULES_SUMMARY } from "@/lib/password-rules";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "weak-password": PASSWORD_RULES_SUMMARY,
  invalid:
    "This reset link is invalid or has expired. Request a new one and try again.",
};

export default async function ResetPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const errorMessage = error ? (ERRORS[error] ?? "Something went wrong.") : null;

  return (
    <div className="page auth-page">
      <main style={{ width: "100%", maxWidth: 400 }}>
        <div className="form-card">
          <div>
            <p className="eyebrow">Set a new password</p>
            <h1>Choose a new password</h1>
            <p className="sub" style={{ marginTop: 8 }}>
              The link expires after one use. <Link href="/login">Cancel</Link>.
            </p>
          </div>

          {error === "invalid" ? (
            <>
              <p className="form-error">{errorMessage}</p>
              <Link
                href="/forgot"
                className="btn --primary --block"
                style={{ marginTop: "var(--s-3)" }}
              >
                Request a new link
              </Link>
            </>
          ) : (
            <form
              action={resetPassword}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--s-4)",
              }}
            >
              <input type="hidden" name="token" value={token} />
              <Field label="New password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                />
              </Field>
              <PasswordRules inputId="password" />
              {errorMessage && <p className="form-error">{errorMessage}</p>}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                iconRight="arrow"
              >
                Update password
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

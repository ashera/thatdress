import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { Button, Field, Input } from "../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-credentials": "Incorrect email or password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div
      className="page"
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--s-9) var(--s-7)",
      }}
    >
      <main style={{ width: "100%", maxWidth: 400 }}>
        <div className="form-card">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>Log in</h1>
            <p className="sub" style={{ marginTop: 8 }}>
              Need an account? <Link href="/register">Register</Link>.
            </p>
          </div>

          <form
            action={login}
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
          >
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
              />
            </Field>

            {errorMessage && <p className="form-error">{errorMessage}</p>}

            <Button type="submit" variant="primary" size="lg" block iconRight="arrow">
              Log in
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

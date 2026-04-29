import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { Button, Field, Input } from "../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-email": "Please enter a valid email address.",
  "weak-password": "Password must be at least 8 characters.",
  "long-password": "Password must be 72 characters or fewer.",
  "email-taken": "An account with that email already exists.",
};

export default async function RegisterPage({
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
            <p className="eyebrow">Join ebikeflip</p>
            <h1>Create your account</h1>
            <p className="sub" style={{ marginTop: 8 }}>
              Already have one? <Link href="/login">Log in</Link>.
            </p>
          </div>

          <form
            action={register}
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

            <Field
              label="Password"
              htmlFor="password"
              help="At least 8 characters."
            >
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

            {errorMessage && <p className="form-error">{errorMessage}</p>}

            <Button type="submit" variant="primary" size="lg" block iconRight="arrow">
              Create account
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

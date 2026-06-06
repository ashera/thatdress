import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/lib/actions/auth";
import { devLoginAs } from "@/lib/actions/dev-login";
import { getCurrentUser } from "@/lib/auth";
import { devLoginEnabled, listDevUsers } from "@/lib/dev-login";
import { Badge, Button, Field, Input } from "../_components/ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-credentials": "Incorrect email or password.",
  suspended: "This account is suspended. Contact support if you think this is a mistake.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; next?: string }>;
}) {
  const { error, reset, next } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  if (await getCurrentUser()) {
    redirect(safeNext ?? "/");
  }

  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  const devUsers = devLoginEnabled() ? await listDevUsers() : [];

  return (
    <div className="page auth-page">

      <main style={{ width: "100%", maxWidth: 400 }}>
        <div className="form-card">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>Log in</h1>
            <p className="sub" style={{ marginTop: 8 }}>
              Need an account?{" "}
              <Link
                href={`/register${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
              >
                Register
              </Link>
              .
            </p>
          </div>

          {reset && (
            <p className="form-success">
              Password updated. You can log in with your new password now.
            </p>
          )}

          <form
            action={login}
            style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}
          >
            {safeNext && <input type="hidden" name="next" value={safeNext} />}
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

            <p
              className="sub"
              style={{ marginTop: 0, textAlign: "center", fontSize: 13 }}
            >
              <Link href="/forgot">Forgot password?</Link>
            </p>
          </form>
        </div>

        {devUsers.length > 0 && (
          <div
            className="form-card"
            style={{
              marginTop: "var(--s-4)",
              background: "#fff7ed",
              borderColor: "#fed7aa",
            }}
          >
            <div style={{ marginBottom: "var(--s-3)" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#9a3412",
                  fontWeight: 700,
                }}
              >
                Dev login
              </span>
              <p
                className="card-sub"
                style={{ margin: "2px 0 0", color: "#9a3412" }}
              >
                One-click sign-in (local only, password bypassed). Set via{" "}
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  DEV_LOGIN=1
                </code>
                .
              </p>
            </div>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                maxHeight: 320,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {devUsers.map((u) => (
                <li key={u.id}>
                  <form action={devLoginAs}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      type="submit"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--hairline)",
                        background: "#fff",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: "var(--t-body-s)",
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: u.suspended ? "var(--ink-3)" : "var(--ink-1)",
                          textDecoration: u.suspended ? "line-through" : "none",
                        }}
                      >
                        {u.email}
                      </span>
                      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {u.is_admin && <Badge variant="ink">admin</Badge>}
                        {u.is_partner && <Badge variant="info">partner</Badge>}
                      </span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

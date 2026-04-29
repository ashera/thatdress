import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { Button, ButtonLink } from "./ui";

export async function AuthNav() {
  const user = await getCurrentUser();

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">eb</span>
        ebikeflip
      </Link>

      <nav>
        <Link href="/listings">Browse</Link>
        <Link href="/listings/new">Sell</Link>
        <a href="/api/health">Status</a>
      </nav>

      <div className="actions">
        {user ? (
          <>
            <span className="who">{user.email}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Log out
              </Button>
            </form>
          </>
        ) : (
          <>
            <ButtonLink href="/login" variant="ghost" size="sm">
              Log in
            </ButtonLink>
            <ButtonLink href="/register" variant="dark" size="sm" icon="plus">
              Register
            </ButtonLink>
          </>
        )}
      </div>
    </header>
  );
}

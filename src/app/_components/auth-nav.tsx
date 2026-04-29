import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { Button, ButtonLink } from "./ui";

async function getDbOk(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function getListingCount(): Promise<number | null> {
  try {
    const result = await query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM listings",
    );
    return Number(result.rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

export async function AuthNav() {
  const [user, dbOk, listingCount] = await Promise.all([
    getCurrentUser(),
    getDbOk(),
    getListingCount(),
  ]);

  return (
    <header className="topbar">
      <div className="brand-row">
        <Link href="/" className="brand">
          <span className="brand-mark">eb</span>
          ebikeflip
        </Link>
        <div
          className={`topbar-stats ${dbOk ? "--ok" : "--err"}`}
          title={dbOk ? "Database connected" : "Database unreachable"}
        >
          <span>
            <b>{listingCount ?? "—"}</b> listings
          </span>
          <span className="sep" aria-hidden>
            ·
          </span>
          <span className="dot" aria-hidden />
          <span>{dbOk ? "Live" : "Down"}</span>
        </div>
      </div>

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

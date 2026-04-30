import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAnonymousLocation } from "@/lib/geo";
import { resolveCurrentRegion } from "@/lib/regions";
import { clearRegion } from "@/lib/actions/regions";
import { unreadMessageCount } from "@/lib/messages";
import { Button, ButtonLink } from "./ui";
import { MobileMenu } from "./mobile-menu";

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
  const [user, dbOk, listingCount, anonLocation, region] = await Promise.all([
    getCurrentUser(),
    getDbOk(),
    getListingCount(),
    getAnonymousLocation(),
    resolveCurrentRegion(),
  ]);
  const currentRegion =
    region.kind === "selected" || region.kind === "auto" ? region.region : null;
  const unread = user ? await unreadMessageCount(user.id) : 0;

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
        {currentRegion && (
          <form action={clearRegion} className="topbar-region-form">
            <button
              type="submit"
              className="topbar-region"
              title="Click to change region"
            >
              <span className="topbar-region-label">{currentRegion.label}</span>
              <span className="topbar-region-x" aria-hidden>
                ⌄
              </span>
            </button>
          </form>
        )}
      </div>

      <MobileMenu>
        <div className="topbar-menu-panel">
          <nav>
            <Link href="/listings">Browse</Link>
            <Link href="/listings/new">Sell</Link>
            {user && <Link href="/listings/mine">My listings</Link>}
            {user && (
              <Link href="/messages" className="nav-messages">
                Messages
                {unread > 0 && (
                  <span className="nav-badge" aria-label={`${unread} unread`}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            )}
            <Link href="/status">Status</Link>
            {user?.isAdmin && (
              <Link href="/admin" className="nav-admin">
                Admin
              </Link>
            )}
          </nav>

          <div className="actions">
            {user ? (
              <>
                <Link href="/profile" className="who-link">
                  <span className="who">{user.email}</span>
                  {user.location ? (
                    <span className="who-loc">{user.location}</span>
                  ) : (
                    <span className="who-loc who-loc--empty">
                      Set location
                    </span>
                  )}
                </Link>
                <form action={logout}>
                  <Button type="submit" variant="ghost" size="sm">
                    Log out
                  </Button>
                </form>
              </>
            ) : (
              <>
                {anonLocation && (
                  <span
                    className="anon-loc"
                    title="Detected from your IP. Sign in or register to set your own."
                  >
                    {anonLocation}
                  </span>
                )}
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Log in
                </ButtonLink>
                <ButtonLink
                  href="/register"
                  variant="dark"
                  size="sm"
                  icon="plus"
                >
                  Register
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </MobileMenu>
    </header>
  );
}

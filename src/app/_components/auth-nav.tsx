import Image from "next/image";
import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { endImpersonation } from "@/lib/actions/impersonation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveCurrentRegion, getCurrentRegionId } from "@/lib/regions";
import { unreadMessageCount } from "@/lib/messages";
import { countFriendsListed } from "@/lib/referral";
import { currentReferralTier } from "@/lib/referral-tiers";
import { ButtonLink } from "./ui";
import { MobileMenu } from "./mobile-menu";
import { AvatarMenu } from "./avatar-menu";

async function getDbOk(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * For admins: total count of every listing, no filters.
 * For everyone else: count of listings the viewer would see on the
 * browse page — published, in their current region, plus their own
 * listings regardless of region.
 */
async function getListingCount(
  user: { id: string; isAdmin: boolean } | null,
  regionId: string | null,
): Promise<number | null> {
  try {
    if (user?.isAdmin) {
      const r = await query<{ n: string }>(
        "SELECT COUNT(*)::text AS n FROM listings WHERE is_draft = FALSE",
      );
      return Number(r.rows[0]?.n ?? 0);
    }
    if (!regionId) {
      // No region resolved — match the empty browse state.
      return 0;
    }
    if (user) {
      const r = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM listings l
          WHERE l.is_published = TRUE
            AND (l.region_id = $1::bigint OR l.seller_id = $2::bigint)`,
        [regionId, user.id],
      );
      return Number(r.rows[0]?.n ?? 0);
    }
    const r = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM listings l
        WHERE l.is_published = TRUE
          AND l.region_id = $1::bigint`,
      [regionId],
    );
    return Number(r.rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

export async function AuthNav() {
  const [user, dbOk, region, regionId] = await Promise.all([
    getCurrentUser(),
    getDbOk(),
    resolveCurrentRegion(),
    getCurrentRegionId(),
  ]);
  const currentRegion =
    region.kind === "selected" || region.kind === "auto" ? region.region : null;
  const [listingCount, unread, friendsListed] = await Promise.all([
    getListingCount(user, regionId),
    user ? unreadMessageCount(user.id) : Promise.resolve(0),
    user ? countFriendsListed(user.id) : Promise.resolve(0),
  ]);
  const tier = currentReferralTier(friendsListed);

  return (
    <>
      {user?.impersonatorId && user?.impersonatorEmail && (
        <div
          role="status"
          aria-live="polite"
          style={{
            width: "100%",
            background: "#fef3c7",
            borderBottom: "1px solid #fcd34d",
            color: "#92400e",
            padding: "8px 16px",
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <span>
            Acting as <strong>{user.email}</strong> — admin{" "}
            <strong>{user.impersonatorEmail}</strong>
          </span>
          <form action={endImpersonation}>
            <button
              type="submit"
              style={{
                padding: "4px 12px",
                borderRadius: 999,
                background: "#92400e",
                color: "#fff",
                border: 0,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Switch back to admin →
            </button>
          </form>
        </div>
      )}
      <header className="topbar">
        <div className="brand-row">
        <Link href="/" className="brand" aria-label="frockd home">
          <Image
            src="/frockd-logo-new-tr-back.png"
            alt="frockd"
            width={1411}
            height={512}
            priority
            className="brand-logo"
          />
        </Link>
        {(() => {
          const stats = (
            <>
              <span>
                <b>{listingCount ?? "—"}</b> listings
              </span>
              <span className="sep" aria-hidden>
                ·
              </span>
              <span className="dot" aria-hidden />
              <span>{dbOk ? "Live" : "Down"}</span>
            </>
          );
          const cls = `topbar-stats ${dbOk ? "--ok" : "--err"}`;
          return user?.isAdmin ? (
            <Link
              href="/status"
              className={`${cls} is-link`}
              title="Open status dashboard"
            >
              {stats}
            </Link>
          ) : (
            <div
              className={cls}
              title={dbOk ? "Database connected" : "Database unreachable"}
            >
              {stats}
            </div>
          );
        })()}
      </div>

      <MobileMenu>
        <div className="topbar-menu-panel">
          <nav>
            <Link href="/listings">Browse</Link>
            <Link href="/listings/mine">Sell</Link>
            <Link href="/tools">Tools</Link>
            <Link href="/blog">Blog</Link>
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
            {user?.isAdmin && (
              <Link href="/admin" className="nav-admin">
                Admin
              </Link>
            )}
          </nav>

          <div className="actions">
            <Link
              href="/regions/pick"
              className="region-pill"
              title="Click to change region"
            >
              <span>{currentRegion ? currentRegion.label : "Pick region"}</span>
              <span className="region-pill-x" aria-hidden>
                ⌄
              </span>
            </Link>

            {user ? (
              <>
                <ButtonLink href="/support" variant="ghost" size="sm">
                  Help
                </ButtonLink>
                <AvatarMenu
                  email={user.email}
                  name={user.firstName}
                  tierEmoji={tier?.emoji ?? null}
                  tierLabel={tier?.label ?? null}
                >
                  <Link href="/listings/mine">My Wardrobe</Link>
                  <Link href="/alerts">Saved searches</Link>
                  <Link href="/profile/refer">Refer &amp; earn</Link>
                  <Link href="/profile">Profile</Link>
                  <form action={logout}>
                    <button type="submit">Log out</button>
                  </form>
                </AvatarMenu>
              </>
            ) : (
              <>
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
    </>
  );
}

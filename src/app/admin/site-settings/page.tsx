import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/site-settings";
import {
  saveSiteSettings,
  updateMaintenanceMode,
} from "@/lib/actions/site-settings";
import { Button, Field, Input } from "../../_components/ui";

export const dynamic = "force-dynamic";

const MAINTENANCE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  scheduled: { ok: true, text: "Maintenance window scheduled." },
  activated: { ok: true, text: "Maintenance is now active." },
  cancelled: { ok: true, text: "Maintenance window cancelled." },
  invalid: {
    ok: false,
    text: "Couldn't update maintenance — check the minutes value.",
  },
};

function formatMaintenanceAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function SiteSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; maintenance?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const settings = await loadSiteSettings();
  const maintenanceMessage = sp.maintenance
    ? MAINTENANCE_MESSAGES[sp.maintenance] ?? null
    : null;
  const maintenanceMs = settings.maintenanceAt
    ? new Date(settings.maintenanceAt).getTime()
    : null;
  const maintenanceState =
    maintenanceMs === null
      ? "off"
      : maintenanceMs <= Date.now()
        ? "active"
        : "countdown";

  return (
    <div className="page admin-page" style={{ maxWidth: 760 }}>
      <Link href="/admin" className="back-link">
        ← Admin console
      </Link>

      <header className="admin-header">
        <p className="eyebrow">Admin · Site settings</p>
        <h1>Site settings</h1>
        <p className="sub">
          Site-wide switches that affect every page.
        </p>
      </header>

      {sp.saved && (
        <p className="form-success" style={{ marginBottom: "var(--s-5)" }}>
          Saved.
        </p>
      )}

      <form action={saveSiteSettings}>
        <section className="form-card">
          <h2 className="card-heading">Search-engine indexing</h2>
          <p className="card-sub">
            When indexing is <strong>blocked</strong> (the pre-launch
            default), every page emits{" "}
            <code>&lt;meta name="robots" content="noindex,nofollow"&gt;</code>{" "}
            and <code>/robots.txt</code> serves <code>Disallow: /</code>{" "}
            for every user-agent. Switch this on when you&rsquo;re ready
            to be discovered.
          </p>

          <div
            style={{
              padding: "var(--s-4) var(--s-5)",
              background: settings.allowIndexing
                ? "var(--ok-100)"
                : "var(--warn-100)",
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              marginTop: "var(--s-4)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: settings.allowIndexing
                  ? "oklch(35% 0.15 150)"
                  : "oklch(35% 0.1 70)",
                marginBottom: 6,
              }}
            >
              Current state
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--ink-1)",
                letterSpacing: "-0.01em",
              }}
            >
              {settings.allowIndexing
                ? "Indexing is allowed"
                : "Indexing is blocked"}
            </div>
            <p
              style={{
                marginTop: 4,
                color: "var(--ink-3)",
                fontSize: "var(--t-body-s)",
                lineHeight: 1.5,
              }}
            >
              {settings.allowIndexing
                ? "Search engines may discover, index, and rank pages on this site."
                : "Search engines that respect robots directives will not index any page on this site."}
            </p>
          </div>

          <label
            className="check-row"
            style={{
              alignItems: "flex-start",
              padding: "var(--s-4) var(--s-5)",
              border: "1px solid var(--hairline)",
              borderRadius: 12,
              background: "var(--surface)",
              marginTop: "var(--s-4)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              name="allow_indexing"
              defaultChecked={settings.allowIndexing}
              style={{ marginTop: 4 }}
            />
            <span style={{ display: "block" }}>
              <strong style={{ color: "var(--ink-1)" }}>
                Allow search engines to index this site
              </strong>
              <span
                style={{
                  display: "block",
                  color: "var(--ink-3)",
                  fontSize: "var(--t-body-s)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Tick this when you&rsquo;re ready to go live. Untick at
                any time to block crawlers again — changes take effect
                on the next page load (no deploy needed).
              </span>
            </span>
          </label>
        </section>

        <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="card-heading">Verified-badge threshold</h2>
          <p className="card-sub">
            Listings with a <strong>health score</strong> at or above this
            number — plus the seller having ticked the authenticity and
            label/lining-photo confirmations and uploaded ≥3 photos —
            auto-elevate to <strong>Verified</strong> and earn a public
            badge on their card and detail page.
          </p>
          <p className="card-sub">
            Lower the number to make Verified easier to earn (more
            listings carry the badge, possibly diluting its meaning).
            Raise it to keep the badge selective. Existing listings
            re-evaluate against the new threshold on their next save.
          </p>

          <Field
            label="Health score required for Verified"
            htmlFor="health_threshold_verified"
            help="0–100. Default 75."
          >
            <Input
              id="health_threshold_verified"
              name="health_threshold_verified"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={String(settings.healthThresholdVerified)}
              required
            />
          </Field>
        </section>

        <section className="form-card" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="card-heading">Referral commission</h2>
          <p className="card-sub">
            Per-listing payout to the referrer for{" "}
            <strong>every</strong> Verified listing a referred user
            posts. A friend who lists five Verified dresses earns the
            referrer five commissions. Set to <code>0</code> to pause
            payouts; the dashboard will still track referrals but show
            $0 earnings.
          </p>
          <p className="card-sub">
            Commission uses the <em>current</em> rate when a referrer
            views their dashboard, so changing the rate retroactively
            adjusts already-earned amounts. Decide carefully before
            raising or lowering it.
          </p>

          <Field
            label="Commission per Verified listing (AUD)"
            htmlFor="referral_commission_dollars"
            help="Whole dollars or decimals — '25', '25.00', or '12.50'."
          >
            <Input
              id="referral_commission_dollars"
              name="referral_commission_dollars"
              type="number"
              min={0}
              max={10000}
              step={0.5}
              defaultValue={(
                settings.referralCommissionCents / 100
              ).toString()}
            />
          </Field>
        </section>

        <div
          style={{
            display: "flex",
            gap: "var(--s-3)",
            justifyContent: "flex-end",
            marginTop: "var(--s-5)",
          }}
        >
          <Button type="submit" variant="primary" iconRight="check">
            Save
          </Button>
        </div>
      </form>

      <section
        className="form-card"
        style={{ marginTop: "var(--s-7)" }}
      >
        <h2 className="card-heading">Maintenance mode</h2>
        <p className="card-sub">
          Activate immediately to take the site down for everyone
          except admins, or schedule it for a few minutes from now to
          give visitors a heads-up. While active, non-admins see a
          polite &lsquo;back soon&rsquo; page; you keep working and
          see a banner across the top so you remember.
        </p>

        <div
          style={{
            padding: "var(--s-4) var(--s-5)",
            background:
              maintenanceState === "active"
                ? "var(--ink-1)"
                : maintenanceState === "countdown"
                  ? "#fef3c7"
                  : "var(--surface-sunken)",
            color:
              maintenanceState === "active" ? "#fff" : "var(--ink-1)",
            border: "1px solid var(--hairline)",
            borderRadius: 12,
            marginTop: "var(--s-4)",
            marginBottom: "var(--s-4)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color:
                maintenanceState === "active"
                  ? "#fcd34d"
                  : "var(--ink-3)",
              marginBottom: 6,
            }}
          >
            Current state
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            {maintenanceState === "active"
              ? "Maintenance is ACTIVE"
              : maintenanceState === "countdown"
                ? `Countdown — starts at ${formatMaintenanceAt(settings.maintenanceAt!)}`
                : "Off"}
          </div>
          {maintenanceState === "countdown" && (
            <p
              style={{
                marginTop: 4,
                fontSize: "var(--t-body-s)",
                color: "var(--ink-3)",
              }}
            >
              All visitors are seeing a banner counting down. The
              maintenance page kicks in automatically at the target
              time.
            </p>
          )}
          {maintenanceState === "active" && (
            <p
              style={{
                marginTop: 4,
                fontSize: "var(--t-body-s)",
                color: "rgba(255,255,255,0.8)",
              }}
            >
              Non-admins are seeing the maintenance page. Cancel below
              to bring the site back.
            </p>
          )}
        </div>

        {maintenanceMessage && (
          <p
            className={
              maintenanceMessage.ok ? "form-success" : "form-error"
            }
            style={{ marginBottom: "var(--s-4)" }}
          >
            {maintenanceMessage.text}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gap: "var(--s-3)",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <form action={updateMaintenanceMode}>
            <input type="hidden" name="mode" value="now" />
            <Button type="submit" variant="dark" block>
              Activate now
            </Button>
          </form>

          <form
            action={updateMaintenanceMode}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <input type="hidden" name="mode" value="schedule" />
            <Field
              label="Schedule in (minutes)"
              htmlFor="maintenance_minutes"
              help="1–1440 (up to 24 h)."
            >
              <Input
                id="maintenance_minutes"
                name="minutes"
                type="number"
                min={1}
                max={1440}
                step={1}
                defaultValue="15"
                required
              />
            </Field>
            <Button type="submit" variant="primary">
              Schedule
            </Button>
          </form>

          {maintenanceState !== "off" && (
            <form action={updateMaintenanceMode}>
              <input type="hidden" name="mode" value="cancel" />
              <Button type="submit" variant="ghost" block>
                Cancel maintenance
              </Button>
            </form>
          )}
        </div>
      </section>

      <section
        className="form-card"
        style={{ marginTop: "var(--s-7)" }}
      >
        <h2 className="card-heading">A note on crawlers that ignore robots</h2>
        <p className="card-sub">
          The robots directives above are the standard signal — every
          mainstream search engine, plus most legitimate scrapers, will
          honour them. They are a request, not enforcement. Bots that
          deliberately ignore <code>robots.txt</code> (resale-data
          scrapers, AI training crawlers, spam bots) will still see the
          site. If that becomes a problem, the next step is rate-limiting
          and/or IP blocks at the Railway / Cloudflare layer — not a
          metadata change.
        </p>
      </section>
    </div>
  );
}

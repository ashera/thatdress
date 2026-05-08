import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { loadSiteSettings } from "@/lib/site-settings";
import { AuthNav } from "./_components/auth-nav";
import { Footer } from "./_components/footer";
import { MaintenanceBanner } from "./_components/maintenance-banner";
import { MaintenancePage } from "./_components/maintenance-page";
import { RegionGate } from "./_components/region-gate";
import { VerifyBanner } from "./_components/verify-banner";

/** Paths that stay reachable even when maintenance mode is active.
 *  Without this allowlist a non-logged-in admin would have no way to
 *  log in to disable maintenance — the /login page itself would render
 *  the maintenance takeover. /verify and /email-change cover token
 *  links that may have been emailed before the window started. */
const MAINTENANCE_ALLOWLIST = [
  "/login",
  "/logout",
  "/forgot",
  "/reset",
  "/verify",
  "/email-change",
];

function pathBypassesMaintenance(pathname: string): boolean {
  return MAINTENANCE_ALLOWLIST.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const archivoBlack = Archivo_Black({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// metadataBase resolves relative OG / Twitter image URLs (including the
// auto-generated /opengraph-image routes) into absolute URLs. This MUST
// be the canonical public domain — not APP_URL, which on Railway is
// the internal hostname (something.up.railway.app). Using APP_URL here
// caused og:image to be served from the Railway hostname even when
// pages were fetched via www.frockd.com.au, which broke social previews.
//
// Override via CANONICAL_URL only when running behind a different
// public domain (e.g. preview/staging). APP_URL stays separate and
// drives the email/cron base URL where there's no request context.
function resolveCanonicalUrl(): string {
  const raw = process.env.CANONICAL_URL?.trim().replace(/\/+$/, "");
  if (!raw) return "https://www.frockd.com.au";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
const SITE_URL = resolveCanonicalUrl();

// Layout reads loadSiteSettings() inside generateMetadata so the
// 'robots: noindex,nofollow' tag flips with the admin toggle. Without
// force-dynamic, Next.js can statically capture the layout metadata
// at build time — and since allowIndexing defaults to FALSE, the
// noindex tag would stay on the page even after an admin enables
// indexing in production.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: "frockd — buy & sell pre-loved formal dresses",
      template: "%s · frockd",
    },
    description:
      "Australia's peer-to-peer marketplace for pre-loved formal dresses and gowns — wedding-guest, black-tie, prom, bridesmaid.",
    applicationName: "frockd",
    // Pre-launch / staging blocks indexing on every page. /robots.txt
    // also disallows everything when this flag is off, but the meta tag
    // is the belt to robots.txt's braces — search engines that have
    // already cached robots.txt will still honour the page-level tag.
    robots: settings.allowIndexing
      ? undefined
      : { index: false, follow: false },
    twitter: {
      card: "summary_large_image",
      title: "frockd — buy & sell pre-loved formal dresses",
      description:
        "Peer-to-peer marketplace for pre-loved formal dresses and gowns.",
    },
    openGraph: {
      type: "website",
      siteName: "frockd",
      title: "frockd — buy & sell pre-loved formal dresses",
      description:
        "Peer-to-peer marketplace for pre-loved formal dresses and gowns.",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The layout already runs force-dynamic (above) so we can read the
  // settings + the current user on every request. Fire in parallel —
  // both queries are tiny and avoid serialising on each other.
  const [settings, user] = await Promise.all([
    loadSiteSettings(),
    getCurrentUser(),
  ]);

  // Maintenance state: countdown (target in future), active (target
  // in past), or off (null). Admins always see the full site; only
  // non-admins are gated when active. Auth paths (/login etc.) are
  // also allowlisted so an admin who isn't currently logged in has a
  // way to log in and turn maintenance off.
  const maintenanceMs = settings.maintenanceAt
    ? new Date(settings.maintenanceAt).getTime()
    : null;
  const inCountdown =
    maintenanceMs !== null && maintenanceMs > Date.now();
  const isActive =
    maintenanceMs !== null && maintenanceMs <= Date.now();

  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const onAuthPath = pathBypassesMaintenance(pathname);

  const showMaintenancePage = isActive && !user?.isAdmin && !onAuthPath;
  const showBanner = inCountdown || (isActive && user?.isAdmin === true);

  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col">
        {showBanner && settings.maintenanceAt && (
          <MaintenanceBanner
            targetIso={settings.maintenanceAt}
            forAdmin={!!user?.isAdmin}
          />
        )}
        {showMaintenancePage ? (
          <MaintenancePage />
        ) : (
          <>
            <AuthNav />
            <VerifyBanner />
            <div className="flex flex-1 flex-col">
              <RegionGate>{children}</RegionGate>
            </div>
            <Footer />
          </>
        )}
      </body>
    </html>
  );
}

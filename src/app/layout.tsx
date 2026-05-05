import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { loadSiteSettings } from "@/lib/site-settings";
import { AuthNav } from "./_components/auth-nav";
import { Footer } from "./_components/footer";
import { RegionGate } from "./_components/region-gate";
import { VerifyBanner } from "./_components/verify-banner";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen flex flex-col">
        <AuthNav />
        <VerifyBanner />
        <div className="flex flex-1 flex-col">
          <RegionGate>{children}</RegionGate>
        </div>
        <Footer />
      </body>
    </html>
  );
}

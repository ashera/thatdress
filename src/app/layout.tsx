import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
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

// metadataBase resolves all relative OG / Twitter image URLs in pages
// that don't override it. APP_URL is set on the deployed services;
// the fallback is the production domain so dev/preview also work.
// Normalises bare-hostname values (e.g. Railway sets APP_URL as
// "frockd-production.up.railway.app" without a protocol) into a full
// URL so new URL(SITE_URL) doesn't throw at build time.
function resolveSiteUrl(): string {
  const raw = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (!raw) return "https://www.frockd.com.au";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
const SITE_URL = resolveSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "frockd — buy & sell pre-loved formal dresses",
    template: "%s · frockd",
  },
  description:
    "Australia's peer-to-peer marketplace for pre-loved formal dresses and gowns — wedding-guest, black-tie, prom, bridesmaid.",
  applicationName: "frockd",
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

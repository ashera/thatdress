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

export const metadata: Metadata = {
  title: "thatdress — buy & sell formal dresses",
  description: "A peer-to-peer marketplace for pre-loved formal dresses and gowns.",
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

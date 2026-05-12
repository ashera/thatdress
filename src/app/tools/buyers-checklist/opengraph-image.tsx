import { renderToolOgImage } from "@/lib/og/tool-og-image";

export const runtime = "nodejs";
export const alt = "Buyer's checklist — interactive inspection list for vetting a pre-loved designer dress before you pay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BuyersChecklistOgImage() {
  return renderToolOgImage({
    eyebrow: "frockd · tools",
    title: "Buyer's checklist",
    subtitle:
      "Due-diligence walk-through for vetting a pre-loved designer dress before you pay. Twelve things to inspect, sixty seconds.",
    emoji: "📋",
    accent: { bg: "#eff6ff", border: "#bfdbfe", ink: "#1e40af" },
  });
}

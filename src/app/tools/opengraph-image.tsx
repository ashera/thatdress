import { renderToolOgImage } from "@/lib/og/tool-og-image";

export const runtime = "nodejs";
export const alt = "frockd tools — free calculators for selling and buying pre-loved dresses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ToolsIndexOgImage() {
  return renderToolOgImage({
    eyebrow: "frockd · tools",
    title: "Calculators for sellers and buyers",
    subtitle:
      "Value estimator, alterations cost, and a buyer's checklist. Built by frockd, Australia's peer-to-peer formal-dress marketplace.",
    emoji: "🧰",
    accent: { bg: "#f4f1ea", border: "#e6dfd5", ink: "#3a342f" },
  });
}

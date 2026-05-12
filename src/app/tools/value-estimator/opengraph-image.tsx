import { renderToolOgImage } from "@/lib/og/tool-og-image";

export const runtime = "nodejs";
export const alt = "Value estimator — what's a pre-loved designer dress worth on the Australian resale market";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ValueEstimatorOgImage() {
  return renderToolOgImage({
    eyebrow: "frockd · tools",
    title: "Value estimator",
    subtitle:
      "What's a pre-loved designer dress worth on the Australian resale market? Input designer, retail price, condition, and age — get a range in seconds.",
    emoji: "💰",
    accent: { bg: "#ecfdf5", border: "#a7f3d0", ink: "#065f46" },
  });
}

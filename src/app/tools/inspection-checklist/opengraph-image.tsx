import { renderToolOgImage } from "@/lib/og-tool-image";

export const runtime = "nodejs";
export const alt = "Used eBike inspection checklist · ebikeflip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return renderToolOgImage({
    eyebrow: "Tool · Buyer",
    title: "Pre-purchase inspection",
    subtitle:
      "22 checks across battery, drivetrain, brakes, electronics, frame, and paperwork — buy/walk verdict at the end.",
  });
}

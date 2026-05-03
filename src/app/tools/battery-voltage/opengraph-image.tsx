import { renderToolOgImage } from "@/lib/og-tool-image";

export const runtime = "nodejs";
export const alt = "eBike battery voltage check · ebikeflip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return renderToolOgImage({
    eyebrow: "Tool · Buyer",
    title: "Is this battery actually charged?",
    subtitle:
      "30-second multimeter check. Healthy / tired / gone — with the spec table for 36V, 48V, and 52V packs.",
  });
}

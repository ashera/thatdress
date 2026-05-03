import { renderToolOgImage } from "@/lib/og-tool-image";

export const runtime = "nodejs";
export const alt = "eBike range calculator · ebikeflip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return renderToolOgImage({
    eyebrow: "Tool · Buyer",
    title: "How far will this eBike actually go?",
    subtitle:
      "Battery Wh, assist level, rider weight, terrain — get an honest range band, not the marketing number.",
  });
}

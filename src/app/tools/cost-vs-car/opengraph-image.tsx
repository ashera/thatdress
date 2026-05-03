import { renderToolOgImage } from "@/lib/og-tool-image";

export const runtime = "nodejs";
export const alt = "eBike vs car cost calculator · ebikeflip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return renderToolOgImage({
    eyebrow: "Tool · Buyer",
    title: "What does your commute actually cost?",
    subtitle:
      "Annual running cost: eBike vs car. Real numbers from RACV 2024, with a $3,000 break-even projection.",
  });
}

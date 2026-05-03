import { renderToolOgImage } from "@/lib/og-tool-image";

export const runtime = "nodejs";
export const alt = "eBike tools · ebikeflip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return renderToolOgImage({
    eyebrow: "Tools",
    title: "Free eBike calculators",
    subtitle:
      "Battery checks, range estimates, AU legality, cost vs car, and a 22-point inspection checklist. No sign-up.",
  });
}

import { renderToolOgImage } from "@/lib/og/tool-og-image";

export const runtime = "nodejs";
export const alt = "Alterations cost — typical AUD ranges for tailoring a formal dress in Australia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function AlterationsCostOgImage() {
  return renderToolOgImage({
    eyebrow: "frockd · tools",
    title: "Alterations cost",
    subtitle:
      "What to budget at the tailor — hems, take-ins, straps, beading, zippers. Typical AUD ranges by alteration type for an Australian tailor.",
    emoji: "✂️",
    accent: { bg: "#fdf2f8", border: "#fbcfe8", ink: "#9d174d" },
  });
}

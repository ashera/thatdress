import { getAnonymousLocation } from "@/lib/geo";
import { listActiveRegions, resolveCurrentRegion } from "@/lib/regions";
import { RegionPicker } from "../../_components/region-picker";

export const dynamic = "force-dynamic";

export default async function PickRegionPage() {
  // Always show the picker, regardless of whether a region is already
  // resolved. The picker form's setRegion action stamps a fresh cookie
  // that overrides any existing detection.
  const [regions, ipLocation, current] = await Promise.all([
    listActiveRegions(),
    getAnonymousLocation(),
    resolveCurrentRegion(),
  ]);

  const detectedDisplay =
    current.kind === "selected" || current.kind === "auto"
      ? current.region.label
      : ipLocation;

  return (
    <RegionPicker
      detected={detectedDisplay}
      regions={regions}
      next="/listings"
    />
  );
}

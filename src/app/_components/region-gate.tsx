import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resolveCurrentRegion } from "@/lib/regions";
import { RegionPicker } from "./region-picker";

const BYPASS_PREFIXES = ["/admin", "/login", "/register", "/api"];

function shouldBypass(path: string): boolean {
  return BYPASS_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

export async function RegionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const path = h.get("x-pathname") ?? "/";

  if (shouldBypass(path)) return <>{children}</>;

  const user = await getCurrentUser();
  if (user?.isAdmin) return <>{children}</>;

  const r = await resolveCurrentRegion();
  if (r.kind === "selected" || r.kind === "auto") return <>{children}</>;

  return (
    <RegionPicker
      detected={r.ipLocation}
      regions={r.regions}
      next={path === "/" ? "/listings" : path}
    />
  );
}

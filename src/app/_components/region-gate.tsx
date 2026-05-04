import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { resolveCurrentRegion } from "@/lib/regions";
import { RegionPicker } from "./region-picker";

// Region gate only intercepts pages where region context is essential
// for the experience. Everything else passes through so deep links and
// crawlers see the real content without hitting the picker. Listings,
// blog posts, and the home page handle "no region selected" state on
// their own (default copy / unfiltered listings).
const BYPASS_PREFIXES = [
  "/",
  "/listings",
  "/blog",
  "/regions",
  "/admin",
  "/login",
  "/register",
  "/forgot",
  "/reset",
  "/verify",
  "/email-change",
  "/profile",
  "/messages",
  "/shortlist",
  "/alerts",
  "/support",
  "/status",
  "/api",
];

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
    <RegionPicker detected={r.ipLocation} regions={r.regions} next="/" />
  );
}

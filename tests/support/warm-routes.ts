/**
 * Playwright globalSetup for the LOCAL suite.
 *
 * The local tests run against `next dev`, which compiles each route on its
 * first request. When several parallel workers hit cold routes at once the
 * compiler queues them and an unlucky first navigation can exceed the
 * navigation timeout — which is exactly the intermittent "flaky, passes on
 * retry" failures we saw on reachability/publish/reset tests.
 *
 * Warming the routes once here (before any worker starts) means the first
 * real navigation in a test always lands on an already-compiled route, so
 * the cold-compile race never happens. No-op for non-local targets (e.g. a
 * production smoke run) and quietly skips if nothing is listening.
 */

const TARGET = process.env.BASE_URL ?? "http://localhost:3000";

// Entry routes the local specs navigate to. Dynamic segments use a
// placeholder id/token — that still compiles the route module, which is all
// we need (the response status is irrelevant).
const ROUTES = [
  "/",
  "/listings",
  "/login",
  "/register",
  "/forgot",
  "/partners",
  "/partners/apply",
  "/tools",
  "/blog",
  "/support",
  "/status",
  "/sitemap.xml",
  "/profile",
  "/alerts",
  "/messages",
  "/shortlist",
  "/listings/mine",
  "/admin",
  "/admin/partner-applications",
  "/admin/regions",
  "/admin/regions/0",
  "/admin/users",
  "/admin/users/0",
  "/admin/listings",
  "/admin/listings/flagged",
  "/admin/site-settings",
  "/listings/0",
  "/sellers/0",
  "/reset/0",
  "/verify",
  "/listings/new/0/basics",
  "/listings/new/0/measurements",
  "/listings/new/0/condition",
  "/listings/new/0/style",
  "/listings/new/0/photos",
  "/listings/new/0/publish",
];

async function hit(path: string, timeoutMs: number): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetch(TARGET + path, { redirect: "manual", signal: ctl.signal });
  } catch {
    // 404 / redirect / abort are all fine — the route compiled regardless.
  } finally {
    clearTimeout(timer);
  }
}

export default async function globalSetup(): Promise<void> {
  // Only ever warm a local dev server — never a remote/prod smoke target.
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(TARGET)) return;

  // Probe first; skip quietly if nothing is listening (e.g. smoke-only run).
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3_000);
    await fetch(TARGET, { signal: ctl.signal }).finally(() =>
      clearTimeout(timer),
    );
  } catch {
    return;
  }

  // A small pool: quick enough to finish, few enough not to swamp the dev
  // compiler (mass-parallel cold compiles are the very thing we're avoiding).
  const queue = [...ROUTES];
  const POOL = 5;
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      let path: string | undefined;
      while ((path = queue.shift())) await hit(path, 60_000);
    }),
  );
}

import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type DbStatus =
  | { ok: true; time: string }
  | { ok: false; error: string };

async function getDbStatus(): Promise<DbStatus> {
  try {
    const result = await query<{ now: string }>("SELECT NOW() as now");
    return { ok: true, time: String(result.rows[0]?.now ?? "") };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export default async function Home() {
  const status = await getDbStatus();

  return (
    <div className="relative flex flex-1 flex-col items-center overflow-hidden bg-gradient-to-b from-ocean-100 via-sand-50 to-sand-100 px-6 py-20 dark:from-ocean-950 dark:via-ocean-900 dark:to-ocean-950">
      {/* Sunset glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-72"
        style={{
          background:
            "radial-gradient(ellipse at top, var(--color-coral-200) 0%, transparent 65%)",
          opacity: 0.55,
        }}
      />
      {/* Urban grid — asphalt streets */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-[0.07] dark:opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-concrete-700) 1px, transparent 1px), linear-gradient(90deg, var(--color-concrete-700) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
        }}
      />
      {/* Beach foam at the bottom */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-0 h-40"
        style={{
          background:
            "linear-gradient(to top, var(--color-sand-200) 0%, transparent 100%)",
          opacity: 0.55,
        }}
      />

      <main className="relative z-10 flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3 text-center sm:text-left">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-concrete-300/70 bg-white/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-concrete-700 dark:border-concrete-700/70 dark:bg-concrete-900/60 dark:text-concrete-200 sm:self-start">
            <span aria-hidden>☀️</span> city · coast · cargo
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-sand-900 dark:text-sand-50 sm:text-5xl">
            From{" "}
            <span className="text-concrete-700 dark:text-concrete-200">
              asphalt
            </span>{" "}
            to{" "}
            <span className="text-ocean-700 dark:text-ocean-300">sand</span>
            <span className="text-coral-500 dark:text-coral-400">.</span> Buy &
            sell ebikes for the city and the shore.
          </h1>
          <p className="max-w-prose text-base leading-7 text-sand-700 dark:text-sand-200">
            ebikeflip is a small, friendly marketplace for used electric bikes.
            Concrete commutes by morning, boardwalk cruises by sunset.
          </p>
        </header>

        <section className="rounded-2xl border border-sand-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-ocean-800 dark:bg-ocean-900/70">
          <h2 className="text-xs font-medium uppercase tracking-wide text-sand-600 dark:text-sand-300">
            Database
          </h2>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                status.ok ? "bg-emerald-500" : "bg-coral-500"
              }`}
              aria-hidden
            />
            <span className="text-base font-medium text-sand-900 dark:text-sand-50">
              {status.ok ? "Connected" : "Not connected"}
            </span>
          </div>
          {status.ok ? (
            <p className="mt-2 font-mono text-sm text-sand-700 dark:text-sand-300">
              Server time: {status.time}
            </p>
          ) : (
            <p className="mt-2 font-mono text-sm text-coral-700 dark:text-coral-300">
              {status.error}
            </p>
          )}
        </section>

        <nav className="flex flex-wrap gap-3">
          <Link
            href="/listings"
            className="rounded-full bg-ocean-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ocean-800 dark:bg-ocean-500 dark:hover:bg-ocean-400"
          >
            Browse listings →
          </Link>
          <Link
            href="/listings/new"
            className="rounded-full border border-coral-300 bg-coral-50 px-5 py-2.5 text-sm font-medium text-coral-700 transition-colors hover:bg-coral-100 dark:border-coral-700/60 dark:bg-coral-900/30 dark:text-coral-200 dark:hover:bg-coral-900/50"
          >
            Sell your bike
          </Link>
          <a
            href="/api/health"
            className="rounded-full border border-sand-300 bg-white/70 px-5 py-2.5 text-sm font-medium text-sand-800 transition-colors hover:bg-white dark:border-ocean-700 dark:bg-ocean-900/60 dark:text-sand-100 dark:hover:bg-ocean-900"
          >
            /api/health
          </a>
        </nav>
      </main>
    </div>
  );
}

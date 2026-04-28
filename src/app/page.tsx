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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            ebikeflip
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Next.js + Node + PostgreSQL
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Starter scaffold. Edit{" "}
            <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-sm dark:bg-zinc-800">
              src/app/page.tsx
            </code>{" "}
            to begin.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Database
          </h2>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                status.ok ? "bg-emerald-500" : "bg-red-500"
              }`}
              aria-hidden
            />
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              {status.ok ? "Connected" : "Not connected"}
            </span>
          </div>
          {status.ok ? (
            <p className="mt-2 font-mono text-sm text-zinc-600 dark:text-zinc-400">
              Server time: {status.time}
            </p>
          ) : (
            <p className="mt-2 font-mono text-sm text-red-600 dark:text-red-400">
              {status.error}
            </p>
          )}
          <p className="mt-4 text-sm text-zinc-500">
            Set <code>DATABASE_URL</code> in <code>.env.local</code> — see{" "}
            <code>.env.example</code>.
          </p>
        </section>
      </main>
    </div>
  );
}

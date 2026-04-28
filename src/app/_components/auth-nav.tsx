import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export async function AuthNav() {
  const user = await getCurrentUser();

  return (
    <nav className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-sand-200/80 bg-sand-50/80 px-6 py-3 backdrop-blur dark:border-ocean-800/70 dark:bg-ocean-950/70">
      <Link
        href="/"
        className="group flex items-center gap-2 text-sm font-semibold tracking-tight"
      >
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-sm bg-ocean-700 text-[11px] font-bold text-white shadow-sm ring-1 ring-coral-500/40 dark:bg-ocean-500"
        >
          eb
        </span>
        <span className="flex items-baseline">
          <span className="text-ocean-700 dark:text-ocean-200">ebike</span>
          <span className="text-coral-600 dark:text-coral-400">flip</span>
        </span>
      </Link>

      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-sand-700 dark:text-sand-200 sm:inline">
            {user.email}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full border border-sand-300 bg-white/70 px-3 py-1.5 font-medium text-sand-800 transition-colors hover:bg-white dark:border-ocean-700 dark:bg-ocean-900/60 dark:text-sand-100 dark:hover:bg-ocean-900"
            >
              Log out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 font-medium text-sand-800 transition-colors hover:bg-sand-100 dark:text-sand-100 dark:hover:bg-ocean-900"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-ocean-700 px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-ocean-800 dark:bg-ocean-500 dark:hover:bg-ocean-400"
          >
            Register
          </Link>
        </div>
      )}
    </nav>
  );
}

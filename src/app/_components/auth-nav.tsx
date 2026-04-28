import Link from "next/link";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export async function AuthNav() {
  const user = await getCurrentUser();

  return (
    <nav className="flex w-full items-center justify-between border-b border-zinc-200 bg-white/70 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/40">
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
      >
        ebikeflip
      </Link>

      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">{user.email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Log out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Register
          </Link>
        </div>
      )}
    </nav>
  );
}

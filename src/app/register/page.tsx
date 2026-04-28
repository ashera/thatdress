import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "invalid-email": "Please enter a valid email address.",
  "weak-password": "Password must be at least 8 characters.",
  "long-password": "Password must be 72 characters or fewer.",
  "email-taken": "An account with that email already exists.",
};

const inputClass =
  "rounded-md border border-sand-300 bg-white/80 px-3 py-2 text-sm text-sand-900 outline-none transition-colors placeholder:text-sand-400 focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 dark:border-ocean-800 dark:bg-ocean-900/60 dark:text-sand-50 dark:placeholder:text-sand-500 dark:focus:border-ocean-400 dark:focus:ring-ocean-700/50";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const { error } = await searchParams;
  const errorMessage = error ? ERRORS[error] ?? "Something went wrong." : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-ocean-100 via-sand-50 to-sand-100 px-6 py-16 dark:from-ocean-950 dark:via-ocean-900 dark:to-ocean-950">
      <main className="w-full max-w-sm rounded-2xl border border-sand-200 bg-white/80 p-8 shadow-sm backdrop-blur dark:border-ocean-800 dark:bg-ocean-900/60">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-900 dark:text-sand-50">
          Join the boardwalk
        </h1>
        <p className="mt-1 text-sm text-sand-700 dark:text-sand-300">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-ocean-700 underline dark:text-ocean-300"
          >
            Log in
          </Link>
          .
        </p>

        <form action={register} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-sand-800 dark:text-sand-200">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-sand-800 dark:text-sand-200">
              Password
            </span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
            />
            <span className="text-xs text-sand-500 dark:text-sand-400">
              At least 8 characters.
            </span>
          </label>

          {errorMessage ? (
            <p className="rounded-md border border-coral-200 bg-coral-50 px-3 py-2 text-sm text-coral-800 dark:border-coral-700/50 dark:bg-coral-900/30 dark:text-coral-200">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-1 rounded-full bg-ocean-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ocean-800 dark:bg-ocean-500 dark:hover:bg-ocean-400"
          >
            Create account
          </button>
        </form>
      </main>
    </div>
  );
}

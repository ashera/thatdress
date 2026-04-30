"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCredentials(formData: FormData): {
  email: string;
  password: string;
  error?: string;
} {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !EMAIL_RE.test(email)) {
    return { email, password, error: "invalid-email" };
  }
  if (password.length < 8) {
    return { email, password, error: "weak-password" };
  }
  if (password.length > 72) {
    return { email, password, error: "long-password" };
  }
  return { email, password };
}

export async function register(formData: FormData): Promise<void> {
  const { email, password, error } = parseCredentials(formData);
  if (error) {
    redirect(`/register?error=${error}`);
  }

  const location =
    String(formData.get("location") ?? "")
      .trim()
      .slice(0, 64) || null;

  const password_hash = await hashPassword(password);

  let userId: string;
  try {
    const result = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, location) VALUES ($1, $2, $3) RETURNING id::text",
      [email, password_hash, location],
    );
    userId = result.rows[0]!.id;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      redirect("/register?error=email-taken");
    }
    throw err;
  }

  await createSession(userId);
  redirect("/");
}

export async function updateLocation(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const location =
    String(formData.get("location") ?? "")
      .trim()
      .slice(0, 64) || null;

  await query(`UPDATE users SET location = $1 WHERE id = $2::bigint`, [
    location,
    user.id,
  ]);

  revalidatePath("/profile");
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function login(formData: FormData): Promise<void> {
  const { email, password, error } = parseCredentials(formData);
  if (error) {
    redirect(`/login?error=invalid-credentials`);
  }

  const result = await query<{ id: string; password_hash: string }>(
    "SELECT id::text, password_hash FROM users WHERE email = $1 LIMIT 1",
    [email],
  );
  const user = result.rows[0];
  if (!user) {
    redirect("/login?error=invalid-credentials");
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    redirect("/login?error=invalid-credentials");
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

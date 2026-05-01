"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { dispatchVerificationEmail } from "@/lib/email-verify";

export async function resendVerificationEmail(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/?verified=already");

  await dispatchVerificationEmail(user.id, user.email);
  redirect("/?verify-sent=1");
}

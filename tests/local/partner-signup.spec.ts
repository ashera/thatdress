import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { cleanupUsers, getUserSignup } from "../support/db";

/**
 * Streamlined partner signup: an anonymous visitor to /partners/apply
 * registers inline (name + email + mobile + password) instead of being
 * routed through the standard login/register pages, then lands back on the
 * apply page authenticated, with the region chooser now shown. Runs against
 * the LOCAL app + DB.
 */

const email = `e2e-partner-${Date.now()}-${randomBytes(2).toString("hex")}@frockd.test`;

test.afterAll(async () => {
  const u = await getUserSignup(email);
  if (u) await cleanupUsers([u.id]);
});

test("a prospect registers inline on /partners/apply and reaches the region chooser", async ({
  page,
}) => {
  await page.goto("/partners/apply", { waitUntil: "networkidle" });

  // Anonymous: the inline signup form is shown, not the region chooser.
  await expect(
    page.getByRole("heading", { name: /Create your partner account/i }),
  ).toBeVisible();

  await page.fill('input[name="first_name"]', "Dakota");
  await page.fill('input[name="surname"]', "Fields");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="mobile"]', "0400 123 456");
  await page.fill('input[name="password"]', "Frockd123");

  await Promise.all([
    page.waitForURL(/registered=1/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Create account & continue/i }).click(),
  ]);

  // Now authenticated → the region chooser is shown.
  await expect(page.getByText(/Choose a region/i)).toBeVisible();

  const user = await getUserSignup(email);
  expect(user).not.toBeNull();
  expect(user!.first_name).toBe("Dakota");
  expect(user!.surname).toBe("Fields");
  expect(user!.mobile).toBe("0400 123 456");
});

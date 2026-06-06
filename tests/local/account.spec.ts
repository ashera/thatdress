import { test, expect } from "@playwright/test";
import { cleanupUsers, createTestUser, mintSession, type TestUser } from "../support/db";

/**
 * Account flows against the LOCAL app + DB: update profile, then change
 * password and sign in again with the new one.
 */

const BASE = "http://localhost:3000";
const NEW_PASSWORD = "NewPass456";

let user: TestUser;

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
});

test("user can update profile and change password", async ({ context, page }) => {
  user = await createTestUser({ password: "TestPass123" });
  const session = await mintSession(user.id);
  await context.addCookies([
    { name: "session", value: session, url: BASE, httpOnly: true },
    { name: "region_id", value: "1", url: BASE, httpOnly: true },
  ]);

  // Update profile.
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  const profileForm = page.locator('form:has(input[name="first_name"])');
  await profileForm.locator('input[name="first_name"]').fill("Eve");
  await profileForm.locator('input[name="surname"]').fill("Tester");
  await profileForm.locator('input[name="town"]').fill("Melbourne");
  await profileForm.locator('input[name="postcode"]').fill("3000");
  await Promise.all([
    page.waitForURL(/\/profile\?.*saved=1/, { timeout: 20_000 }),
    profileForm.locator('button[type="submit"]').click(),
  ]);

  // Change password.
  await page.goto("/profile", { waitUntil: "domcontentloaded" });
  const pwForm = page.locator('form:has(input[name="current_password"])');
  await pwForm.locator('input[name="current_password"]').fill("TestPass123");
  await pwForm.locator('input[name="new_password"]').fill(NEW_PASSWORD);
  await pwForm.locator('input[name="confirm_password"]').fill(NEW_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/profile\?.*password_changed=1/, { timeout: 20_000 }),
    pwForm.locator('button[type="submit"]').click(),
  ]);

  // Sign in again with the new password.
  await context.clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', NEW_PASSWORD);
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /Log in/i }).click(),
  ]);
  await page.goto("/listings/mine", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/listings/mine");
});

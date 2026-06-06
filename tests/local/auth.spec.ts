import { test, expect } from "@playwright/test";
import { cleanupUsers, findUserIdByEmail } from "../support/db";

/**
 * Write-flow: register a brand-new account and then sign back in, both
 * through the real UI, against the LOCAL app + local DB. Cleans up the
 * created user afterwards.
 */

const email = `e2e-auth-${Date.now()}-${Math.floor(Math.random() * 1e6)}@frockd.test`;
const password = "TestPass123"; // meets rules: 8–72 chars, upper, digit

test.afterAll(async () => {
  const id = await findUserIdByEmail(email);
  if (id) await cleanupUsers([id]);
});

test("a new user can register and then log in", async ({ context, page }) => {
  // Register — lands logged in on the home page.
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /Create account/i }).click(),
  ]);

  // Authenticated: the seller dashboard loads instead of bouncing to /login.
  await page.goto("/listings/mine", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/listings/mine");

  // Simulate a fresh visit, then sign in with the same credentials.
  await context.clearCookies();
  await page.goto("/listings/mine", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/login");

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /Log in/i }).click(),
  ]);

  // Signed in again.
  await page.goto("/listings/mine", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/listings/mine");
});

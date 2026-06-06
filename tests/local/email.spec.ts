import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  findUserIdByEmail,
  getLastEmailTo,
  type TestUser,
} from "../support/db";

/**
 * Email flows against the LOCAL app + DB. Requires the app to run with
 * EMAIL_CAPTURE=1 (set in .env.local): instead of calling Resend,
 * sendEmail records each message in sent_emails, which these tests read.
 */

const registerEmail = `e2e-mail-${Date.now()}-${Math.floor(Math.random() * 1e6)}@frockd.test`;
let resetUser: TestUser;

test.afterAll(async () => {
  const ids: string[] = [];
  const rid = await findUserIdByEmail(registerEmail);
  if (rid) ids.push(rid);
  if (resetUser) ids.push(resetUser.id);
  if (ids.length) await cleanupUsers(ids);
});

test("registering sends a verification email", async ({ page }) => {
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', registerEmail);
  await page.fill('input[name="password"]', "TestPass123");
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /Create account/i }).click(),
  ]);

  const mail = await getLastEmailTo(registerEmail);
  expect(mail, "no verification email captured").toBeTruthy();
  expect(mail!.subject).toMatch(/verify your frockd email/i);
});

test("password reset emails a working reset link", async ({ context, page }) => {
  resetUser = await createTestUser({ password: "TestPass123" });

  // Request a reset.
  await page.goto("/forgot", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', resetUser.email);
  await Promise.all([
    page.waitForURL(/\/forgot\?.*sent=1/, { timeout: 20_000 }),
    page.getByRole("button", { name: /reset|send/i }).first().click(),
  ]);

  // The captured email carries a /reset/<token> link.
  const mail = await getLastEmailTo(resetUser.email);
  expect(mail, "no reset email captured").toBeTruthy();
  expect(mail!.subject).toMatch(/reset your frockd password/i);
  const m = mail!.html.match(/\/reset\/([A-Za-z0-9_-]+)/);
  expect(m, "no reset link in email").toBeTruthy();
  const resetPath = m![0];

  // Use the link to set a new password.
  const NEW = "ResetPass789";
  await page.goto(resetPath, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="password"]', NEW);
  await Promise.all([
    page.waitForURL(/\/login\?.*reset=1/, { timeout: 20_000 }),
    page.getByRole("button", { name: /reset|set|save|update/i }).first().click(),
  ]);

  // Sign in with the new password.
  await context.clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', resetUser.email);
  await page.fill('input[name="password"]', NEW);
  await Promise.all([
    page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 20_000 }),
    page.getByRole("button", { name: /Log in/i }).click(),
  ]);
  await page.goto("/listings/mine", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/listings/mine");
});

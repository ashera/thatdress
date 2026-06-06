import { test, expect } from "@playwright/test";
import { cleanupUsers, createTestUser, mintSession, type TestUser } from "../support/db";

/** Support: a logged-in user opens a ticket. Local app + DB. */

const BASE = "http://localhost:3000";
let user: TestUser;

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
});

test("user can open a support ticket", async ({ context, page }) => {
  user = await createTestUser();
  await context.addCookies([
    { name: "session", value: await mintSession(user.id), url: BASE, httpOnly: true },
    { name: "region_id", value: "1", url: BASE, httpOnly: true },
  ]);

  await page.goto("/support", { waitUntil: "domcontentloaded" });
  const subject = "E2E: cannot upload photos";
  await page.fill('input[name="subject"]', subject);
  await page.fill('textarea[name="body"]', "Photos fail on the wizard step.");
  await Promise.all([
    page.waitForURL(/\/support\/\d+/, { timeout: 20_000 }),
    page.locator('form:has(input[name="subject"]) button[type="submit"]').click(),
  ]);

  await expect(page.getByText(subject).first()).toBeVisible();
});

import { test, expect } from "@playwright/test";
import { cleanupUsers, createTestUser, mintSession, type TestUser } from "../support/db";

/** Saved search: filter the browse page, save the search, see it under
 *  /alerts. Local app + DB. */

const BASE = "http://localhost:3000";
let user: TestUser;

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
});

test("user can save a search and see it under alerts", async ({ context, page }) => {
  user = await createTestUser();
  await context.addCookies([
    { name: "session", value: await mintSession(user.id), url: BASE, httpOnly: true },
    { name: "region_id", value: "1", url: BASE, httpOnly: true },
  ]);

  // A query term makes filterCount > 0, which reveals the save form.
  await page.goto("/listings?q=lace", { waitUntil: "networkidle" });
  const form = page.locator("form.save-search");
  await expect(form).toBeVisible();
  await form.locator('input[name="name"]').fill("Lace under 500");
  await Promise.all([
    page.waitForURL(/\/alerts\?.*saved=1/, { timeout: 20_000 }),
    form.locator('button[type="submit"]').click(),
  ]);

  await expect(page.getByText(/Lace under 500/i).first()).toBeVisible();
});

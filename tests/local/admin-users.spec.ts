import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  getUserSuspension,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Admin user management: suspending an account (which kills its live
 * sessions) and unsuspending it, plus impersonating a user and switching
 * back. Exercises toggleUserSuspended + startImpersonation/endImpersonation.
 * Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";

let admin: TestUser;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
});

test.afterAll(async () => {
  await cleanupUsers([admin.id]);
});

async function adminPage(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  return { ctx, page: await ctx.newPage() };
}

test("admin suspends and unsuspends a user", async ({ browser }) => {
  const target = await createTestUser();
  await mintSession(target.id); // a live session that suspend should kill
  const { ctx, page } = await adminPage(browser);
  try {
    await page.goto(`/admin/users/${target.id}`, { waitUntil: "networkidle" });
    // Both suspend + unsuspend redirect to the same ?saved=1 URL, so poll
    // the DB for the outcome rather than racing a waitForURL that's already
    // satisfied by the previous navigation.
    await page.getByRole("button", { name: /^Suspend account$/i }).click();
    await expect
      .poll(async () => (await getUserSuspension(target.id)).suspended, {
        timeout: 15_000,
      })
      .toBe(true);
    expect((await getUserSuspension(target.id)).sessions).toBe(0); // sessions killed

    await page.getByRole("button", { name: /^Unsuspend account$/i }).click();
    await expect
      .poll(async () => (await getUserSuspension(target.id)).suspended, {
        timeout: 15_000,
      })
      .toBe(false);
  } finally {
    await cleanupUsers([target.id]);
    await ctx.close();
  }
});

test("admin impersonates a user and switches back", async ({ browser }) => {
  const target = await createTestUser();
  const { ctx, page } = await adminPage(browser);
  try {
    await page.goto(`/admin/users/${target.id}`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL((u) => !/\/admin\//.test(u.pathname), { timeout: 20_000 }),
      page.getByRole("button", { name: /Log in as this user/i }).click(),
    ]);

    // The "acting as" banner names the impersonated account.
    await expect(page.getByText(/Acting as/i)).toBeVisible();
    await expect(page.getByText(target.email).first()).toBeVisible();

    // Switch back restores the admin and returns to the user page.
    await Promise.all([
      page.waitForURL(new RegExp(`/admin/users/${target.id}`), { timeout: 20_000 }),
      page.getByRole("button", { name: /Switch back to admin/i }).click(),
    ]);
    await expect(page.getByText(/Acting as/i)).toHaveCount(0);
    // Admin-only control is back, proving we're the admin again.
    await expect(
      page.getByRole("button", { name: /Suspend account/i }),
    ).toBeVisible();
  } finally {
    await cleanupUsers([target.id]);
    await ctx.close();
  }
});

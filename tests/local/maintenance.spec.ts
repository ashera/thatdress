import { test, expect } from "@playwright/test";
import {
  clearMaintenance,
  cleanupUsers,
  createTestUser,
  getMaintenanceAt,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Maintenance toggle. An admin schedules a maintenance window (a future
 * countdown) and cancels it. We assert the setting round-trips and that a
 * *scheduled* (not-yet-active) window does NOT block non-admins.
 *
 * The fully-active "now" state is deliberately not exercised here: it's a
 * single global row that would gate every other parallel test mid-run. The
 * schedule + cancel paths share updateMaintenanceMode, so the action is
 * still covered. finally force-clears the window as a safety net.
 */

const BASE = "http://localhost:3000";

let admin: TestUser;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
});

test.afterAll(async () => {
  await clearMaintenance();
  await cleanupUsers([admin.id]);
});

test("admin schedules a maintenance window and cancels it", async ({
  browser,
}) => {
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await adminCtx.newPage();
  try {
    await page.goto("/admin/site-settings", { waitUntil: "networkidle" });

    // Schedule a window an hour out (countdown, not active).
    const scheduleForm = page.locator('form:has(input[name="minutes"])');
    await scheduleForm.locator('input[name="minutes"]').fill("60");
    await Promise.all([
      page.waitForURL(/maintenance=scheduled/, { timeout: 20_000 }),
      scheduleForm.locator('button[type="submit"]').click(),
    ]);
    const at = await getMaintenanceAt();
    expect(at).not.toBeNull();
    expect(new Date(at!).getTime()).toBeGreaterThan(Date.now());

    // A scheduled (future) window must NOT block a non-admin visitor —
    // the site stays up until the countdown reaches zero.
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    const resp = await anon.goto("/", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);
    await expect(
      anon.getByRole("link", { name: /Browse listings/i }).first(),
    ).toBeVisible();
    await anonCtx.close();

    // Cancel — the window clears.
    const cancelForm = page.locator(
      'form:has(input[name="mode"][value="cancel"])',
    );
    await Promise.all([
      page.waitForURL(/maintenance=cancelled/, { timeout: 20_000 }),
      cancelForm.locator('button[type="submit"]').click(),
    ]);
    expect(await getMaintenanceAt()).toBeNull();
  } finally {
    await clearMaintenance();
    await adminCtx.close();
  }
});

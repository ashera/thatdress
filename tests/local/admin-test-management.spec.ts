import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  deleteTestCatalogRows,
  mintSession,
  seedTestCatalogRow,
  type TestUser,
} from "../support/db";
import { randomBytes } from "node:crypto";

/**
 * Test Management: a summary landing page plus a detail page per suite.
 * Tests are numbered and categorised (category derived from the spec
 * file). Runs against the LOCAL app + DB. Catalogue rows are seeded
 * directly so the assertions don't depend on a prior Playwright run.
 */

const BASE = "http://localhost:3000";

let admin: TestUser;

const tag = randomBytes(3).toString("hex");
const SMOKE_KEY = `smoke/smoke.spec.ts › e2e-tm-smoke-${tag}`;
const SMOKE_TITLE = `E2E TM smoke ${tag}`;
const LOCAL_KEY = `local/partner.spec.ts › e2e-tm-local-${tag}`;
const LOCAL_TITLE = `E2E TM local ${tag}`;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
  // smoke/smoke.spec.ts → category "Core"; local/partner.spec.ts → "Partner".
  await seedTestCatalogRow({
    testKey: SMOKE_KEY,
    title: SMOKE_TITLE,
    suite: "smoke",
    file: "smoke/smoke.spec.ts",
  });
  await seedTestCatalogRow({
    testKey: LOCAL_KEY,
    title: LOCAL_TITLE,
    suite: "local",
    file: "local/partner.spec.ts",
  });
});

test.afterAll(async () => {
  await deleteTestCatalogRows([SMOKE_KEY, LOCAL_KEY]);
  await cleanupUsers([admin.id]);
});

async function adminPage(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  return { ctx, page: await ctx.newPage() };
}

test("summary shows a card per suite with run controls", async ({ browser }) => {
  const { ctx, page } = await adminPage(browser);
  try {
    await page.goto("/admin/test-management", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Test Management" }),
    ).toBeVisible();
    // Suite cards link through to the detail pages.
    await expect(
      page.locator('a[href="/admin/test-management/smoke"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/admin/test-management/local"]').first(),
    ).toBeVisible();
    // Run controls survive on the summary.
    await expect(
      page.getByRole("button", { name: /Run smoke/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Run local/i })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test("suite detail lists its tests with a number and category", async ({
  browser,
}) => {
  const { ctx, page } = await adminPage(browser);
  try {
    // Smoke detail: our seeded smoke test, categorised "Core", with a #number.
    await page.goto("/admin/test-management/smoke", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(SMOKE_TITLE);
    await expect(page.locator("body")).toContainText("Core");
    await expect(page.getByText(/^#\d+$/).first()).toBeVisible();
    // The local-only test must not appear on the smoke page.
    await expect(page.locator("body")).not.toContainText(LOCAL_TITLE);

    // Local detail: our seeded local test, categorised "Partner".
    await page.goto("/admin/test-management/local", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(LOCAL_TITLE);
    await expect(page.locator("body")).toContainText("Partner");
    await expect(page.locator("body")).not.toContainText(SMOKE_TITLE);
  } finally {
    await ctx.close();
  }
});

test("an unknown suite 404s", async ({ browser }) => {
  const { ctx, page } = await adminPage(browser);
  try {
    const resp = await page.goto("/admin/test-management/bogus");
    expect(resp?.status()).toBe(404);
  } finally {
    await ctx.close();
  }
});

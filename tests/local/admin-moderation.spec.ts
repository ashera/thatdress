import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  getListingModeration,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Admin listing moderation: an admin flags a listing for review (writing
 * an audit-trail flag row) and then restores it (resolving the open
 * flags). Exercises setListingTrustStatus both directions. Runs against
 * the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";
const REGION = "8";

let admin: TestUser;
let seller: TestUser;
let listingId: string;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
  seller = await createTestUser();
  ({ listingId } = await seedListing(seller.id, {
    regionId: REGION,
    title: "E2E Moderation Dress",
  }));
});

test.afterAll(async () => {
  await cleanupUsers([admin.id, seller.id]);
});

test("admin flags a listing for review, then restores it", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });

  // Open the flag dialog robustly (client trigger; re-click until the
  // reason field shows, in case a click lands before hydration).
  const reason = page.locator('textarea[name="reason"]');
  await expect(async () => {
    await page.getByRole("button", { name: /Flag for review/i }).click();
    await expect(reason).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await reason.fill("Photos look lifted from a designer's site.");
  await page.getByRole("button", { name: /^Flag listing$/i }).click();

  await expect
    .poll(async () => (await getListingModeration(listingId)).trustStatus, {
      timeout: 15_000,
    })
    .toBe("flagged");
  expect((await getListingModeration(listingId)).openFlags).toBe(1);

  // Restore (un-flag) — resolves the open flag.
  await page.getByRole("button", { name: /Restore \(un-flag\)/i }).click();
  await expect
    .poll(async () => (await getListingModeration(listingId)).trustStatus, {
      timeout: 15_000,
    })
    .toBe("self-declared");
  expect((await getListingModeration(listingId)).openFlags).toBe(0);

  await ctx.close();
});

import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  mintSession,
  seedListing,
  setListingSold,
  type TestUser,
} from "../support/db";
import { randomBytes } from "node:crypto";

/**
 * Partner dashboard drill-downs: each headline number links to the list it
 * represents. Tiles deep-link into /partner/listings with the matching
 * filter (status / new / review / seller), and "Active sellers" opens the
 * new /partner/sellers page. Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";

let partner: TestUser;
let sellerLive: TestUser;
let sellerSold: TestUser;
let region: { id: string; label: string };

const tag = randomBytes(3).toString("hex");
const LIVE_TITLE = `E2E Live Listing ${tag}`;
const SOLD_TITLE = `E2E Sold Listing ${tag}`;

test.beforeAll(async () => {
  partner = await createTestUser({ isPartner: true });
  sellerLive = await createTestUser();
  sellerSold = await createTestUser();
  region = await createTestRegion();
  await assignPartnerRegion(partner.id, region.id);

  await seedListing(sellerLive.id, { regionId: region.id, title: LIVE_TITLE });
  const sold = await seedListing(sellerSold.id, {
    regionId: region.id,
    title: SOLD_TITLE,
  });
  await setListingSold(sold.listingId);
});

test.afterAll(async () => {
  await cleanupUsers([partner.id, sellerLive.id, sellerSold.id]);
  await deleteTestRegions([region.id]);
});

async function partnerPage(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(partner.id), url: BASE, httpOnly: true },
  ]);
  return { ctx, page: await ctx.newPage() };
}

test("dashboard tiles link to the matching list pages", async ({ browser }) => {
  const { ctx, page } = await partnerPage(browser);
  try {
    await page.goto("/partner", { waitUntil: "networkidle" });
    for (const href of [
      "/partner/listings?status=live",
      "/partner/listings?status=sold",
      "/partner/listings?new=7d",
      "/partner/listings?review=open",
      "/partner/sellers",
    ]) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
  } finally {
    await ctx.close();
  }
});

test("status drill-downs filter to live vs sold listings", async ({
  browser,
}) => {
  const { ctx, page } = await partnerPage(browser);
  try {
    // The partner listings table shows the seller email (the listing name
    // column is designer+model, identical for both seeds), so assert on that.
    await page.goto("/partner/listings?status=live", {
      waitUntil: "networkidle",
    });
    await expect(page.locator("body")).toContainText(sellerLive.email);
    await expect(page.locator("body")).not.toContainText(sellerSold.email);

    await page.goto("/partner/listings?status=sold", {
      waitUntil: "networkidle",
    });
    await expect(page.locator("body")).toContainText(sellerSold.email);
    await expect(page.locator("body")).not.toContainText(sellerLive.email);
  } finally {
    await ctx.close();
  }
});

test("active sellers page lists live sellers and drills into their listings", async ({
  browser,
}) => {
  const { ctx, page } = await partnerPage(browser);
  try {
    await page.goto("/partner/sellers", { waitUntil: "networkidle" });
    // The seller with a live listing shows; the sold-only seller doesn't.
    await expect(page.locator("body")).toContainText(sellerLive.email);
    await expect(page.locator("body")).not.toContainText(sellerSold.email);

    // The per-seller drill-down link narrows /partner/listings to them.
    const link = page.locator(
      `a[href="/partner/listings?seller=${sellerLive.id}"]`,
    );
    await expect(link.first()).toBeVisible();

    await page.goto(`/partner/listings?seller=${sellerLive.id}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("body")).toContainText(sellerLive.email);
    await expect(page.locator("body")).not.toContainText(sellerSold.email);
  } finally {
    await ctx.close();
  }
});

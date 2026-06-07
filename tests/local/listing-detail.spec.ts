import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * The listing detail page always shows the listing's region, regardless of
 * the viewer's own region. Runs against the LOCAL app + DB.
 */

let seller: TestUser;
let region: { id: string; label: string };
let listingId: string;

test.beforeAll(async () => {
  seller = await createTestUser();
  region = await createTestRegion();
  ({ listingId } = await seedListing(seller.id, {
    regionId: region.id,
    title: "E2E Region-Shown Dress",
  }));
});

test.afterAll(async () => {
  await cleanupUsers([seller.id]);
  await deleteTestRegions([region.id]);
});

test("the listing detail page shows the listing's region", async ({ page }) => {
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Region", { exact: true })).toBeVisible();
  await expect(page.getByText(region.label).first()).toBeVisible();
});

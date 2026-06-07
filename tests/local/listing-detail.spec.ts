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
 * The listing detail page always shows the listing's region (above the
 * dress image), regardless of the viewer's own region. Runs against the
 * LOCAL app + DB.
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

test("the listing detail page shows the listing's region above the image", async ({
  page,
}) => {
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  // The region label sits above the gallery image.
  const region$ = page.getByText(region.label).first();
  await expect(region$).toBeVisible();
  const gallery$ = page.locator(".detail .gallery, .detail .detail-photo").first();
  await expect(gallery$).toBeVisible();
  const regionBox = await region$.boundingBox();
  const galleryBox = await gallery$.boundingBox();
  expect(regionBox).not.toBeNull();
  expect(galleryBox).not.toBeNull();
  expect(regionBox!.y).toBeLessThan(galleryBox!.y);
});

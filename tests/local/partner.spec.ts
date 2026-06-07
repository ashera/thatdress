import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  getRegionFeeCents,
  mintSession,
  seedListing,
  setListingPublished,
  type TestUser,
} from "../support/db";

/** Partner flow: a partner sets a listing fee for one of their marketing
 *  regions from the partner dashboard. Local app + DB.
 *  Uses a freshly-created active region rather than a shared seed region,
 *  so concurrent runs never contend over the unique region→partner slot. */

const BASE = "http://localhost:3000";
let user: TestUser;
let region: { id: string; label: string };

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
  if (region) await deleteTestRegions([region.id]);
});

test("partner can set a listing fee for their region", async ({ context, page }) => {
  user = await createTestUser({ isPartner: true });
  region = await createTestRegion();
  await assignPartnerRegion(user.id, region.id);
  await context.addCookies([
    { name: "session", value: await mintSession(user.id), url: BASE, httpOnly: true },
    { name: "region_id", value: region.id, url: BASE, httpOnly: true },
  ]);

  await page.goto("/partner", { waitUntil: "domcontentloaded" });
  await page.fill(`input[name="fee_${region.id}"]`, "15.00");
  await page.getByRole("button", { name: /Save listing fees/i }).click();

  // Poll for the persisted fee rather than racing an already-settled
  // networkidle wait against the server action's write.
  await expect
    .poll(async () => getRegionFeeCents(region.id), { timeout: 15_000 })
    .toBe(1500);
});

test("partner sees a region map on the dashboard and a map toggle on listings", async ({
  browser,
}) => {
  const partner = await createTestUser({ isPartner: true });
  const reg = await createTestRegion();
  await assignPartnerRegion(partner.id, reg.id);
  const seller = await createTestUser();
  // seedListing uses postcode 3000 (in the postcodes centroid seed), so it
  // lands on the map.
  await seedListing(seller.id, { regionId: reg.id });

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(partner.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    // Dashboard shows the region map card (renders only when listings map).
    await page.goto("/partner", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Where your listings are/i }),
    ).toBeVisible();

    // Region-listings map view replaces the table with the map.
    await page.goto("/partner/listings?view=map", { waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: /^Map$/ })).toBeVisible();
    await expect(page.locator("table.data-table")).toHaveCount(0);
  } finally {
    await cleanupUsers([partner.id, seller.id]);
    await deleteTestRegions([reg.id]);
  }
});

test("a region's partner can open a hidden listing in their region", async ({
  browser,
}) => {
  const partner = await createTestUser({ isPartner: true });
  const reg = await createTestRegion();
  await assignPartnerRegion(partner.id, reg.id);
  const otherSeller = await createTestUser();
  const buyer = await createTestUser(); // a non-partner, non-owner control
  const { listingId } = await seedListing(otherSeller.id, { regionId: reg.id });
  await setListingPublished(listingId, false); // hidden

  try {
    // The partner who markets the region can view the hidden listing
    // (region-listings page links straight here — used to 404).
    const partnerCtx = await browser.newContext();
    await partnerCtx.addCookies([
      { name: "session", value: await mintSession(partner.id), url: BASE, httpOnly: true },
    ]);
    const pp = await partnerCtx.newPage();
    const partnerResp = await pp.goto(`/listings/${listingId}`);
    expect(partnerResp?.status()).toBe(200);
    await partnerCtx.close();

    // A regular signed-in shopper still gets a 404 on the hidden listing.
    const buyerCtx = await browser.newContext();
    await buyerCtx.addCookies([
      { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
    ]);
    const bpg = await buyerCtx.newPage();
    const buyerResp = await bpg.goto(`/listings/${listingId}`);
    expect(buyerResp?.status()).toBe(404);
    await buyerCtx.close();
  } finally {
    await cleanupUsers([partner.id, otherSeller.id, buyer.id]);
    await deleteTestRegions([reg.id]);
  }
});

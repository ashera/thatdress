import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  getListing,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Seller flows against the LOCAL app + DB: edit a published listing
 * (via the wizard's edit mode) and mark it sold. Serial so the edit runs
 * before the sale on the shared listing.
 */

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3000";
const REGION = "1";

let seller: TestUser;
let listingId: string;

test.beforeAll(async () => {
  seller = await createTestUser();
  ({ listingId } = await seedListing(seller.id, {
    regionId: REGION,
    priceCents: 20000,
    title: "E2E Seller Dress",
  }));
});

test.afterAll(async () => {
  await cleanupUsers([seller.id]);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "session", value: await mintSession(seller.id), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
});

test("seller can edit a listing's price and description", async ({ page }) => {
  // The edit route redirects into the wizard; jump to the publish step.
  await page.goto(`/listings/new/${listingId}/publish`, { waitUntil: "networkidle" });
  await page.fill('input[name="price"]', "250");
  await page.fill('textarea[name="description"]', "Updated by E2E test.");
  await page.check('input[name="is_authentic_declared"]');
  await Promise.all([
    page.waitForURL(/\/listings\/\d+/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Save changes/i }).click(),
  ]);

  const row = await getListing(listingId);
  expect(row?.price_cents).toBe(25000);
  expect(row?.description).toContain("Updated by E2E test.");
});

test("seller can mark a listing as sold", async ({ page }) => {
  // The owner mark-sold control lives on the listing detail page.
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Mark as sold/i }).first().click();

  const dialogForm = page.locator('form:has(input[name="_mode"][value="elsewhere"])');
  await dialogForm.locator('input[name="_mode"][value="elsewhere"]').check();
  await dialogForm.locator('button[type="submit"]').click();

  // The server action writes sold_at then redirects. Poll the DB for the
  // real outcome — a bare waitForLoadState("networkidle") resolves
  // instantly here (the page was already idle from the goto), so the read
  // would race the write and flake under parallel load.
  await expect
    .poll(async () => (await getListing(listingId))?.sold_at, { timeout: 15_000 })
    .toBeTruthy();
});

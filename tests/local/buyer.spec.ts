import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  countOffersByBuyer,
  countShortlist,
  createTestUser,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Buyer flows against the LOCAL app + DB: shortlist a listing, contact
 * the seller, and make an offer. Shares one seller + buyer + seeded
 * listing across the tests (serial so they run in one worker).
 */

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3000";
const REGION = "1";

let seller: TestUser;
let buyer: TestUser;
let listingId: string;

test.beforeAll(async () => {
  seller = await createTestUser();
  buyer = await createTestUser();
  ({ listingId } = await seedListing(seller.id, {
    regionId: REGION,
    title: "E2E Buyer Dress",
  }));
});

test.afterAll(async () => {
  await cleanupUsers([seller.id, buyer.id]);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
});

test("buyer can shortlist a listing", async ({ page }) => {
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await page
    .locator('form:has(input[name="next"]):has(input[name="listingId"]) button[type="submit"]')
    .first()
    .click();
  // After the toggle + redirect the button flips to "Saved"; wait for it
  // so we assert only once the server action has committed.
  await expect(page.getByRole("button", { name: /^Saved$/i })).toBeVisible();
  expect(await countShortlist(buyer.id)).toBe(1);

  await page.goto("/shortlist", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/E2E Buyer Dress/i).first()).toBeVisible();
});

test("buyer can contact the seller and send a message", async ({ page }) => {
  await page.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/messages\/\d+/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Contact seller/i }).click(),
  ]);

  const body = "Hi, is this dress still available?";
  const msgForm = page.locator('form:has(textarea[name="body"]), form:has(input[name="body"])');
  await msgForm.locator('[name="body"]').fill(body);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    msgForm.locator('button[type="submit"]').first().click(),
  ]);
  await expect(page.getByText(body).first()).toBeVisible();
});

test("buyer can make an offer", async ({ page }) => {
  await page.goto(`/listings/${listingId}/offer`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="amount"]', "150");
  await Promise.all([
    page.waitForURL(/\/messages\/\d+/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Send offer/i }).click(),
  ]);
  expect(await countOffersByBuyer(buyer.id)).toBe(1);
});

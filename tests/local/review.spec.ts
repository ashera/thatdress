import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  getLastEmailTo,
  getSellerRating,
  mintSession,
  seedConversation,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Seller-review loop: a seller marks a listing sold to a frockd buyer,
 * which emails the buyer a tokenised review link; the buyer follows it and
 * leaves a rating, which lands against the seller. Exercises
 * closeListingWithBuyer (buyer attribution + token issue + email) and
 * submitListingReview end to end. Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";
const REGION = "8";

let seller: TestUser;
let buyer: TestUser;
let listingId: string;

test.beforeAll(async () => {
  seller = await createTestUser();
  buyer = await createTestUser();
  ({ listingId } = await seedListing(seller.id, {
    regionId: REGION,
    priceCents: 20000,
    title: "E2E Review Dress",
  }));
  // A conversation makes the buyer attributable in the mark-sold dialog.
  await seedConversation(listingId, buyer.id, seller.id);
});

test.afterAll(async () => {
  await cleanupUsers([seller.id, buyer.id]);
});

test("seller marks sold to a buyer, who then leaves a review", async ({
  browser,
}) => {
  // Multi-step: mark sold → wait for the review email → submit review.
  test.setTimeout(90_000);
  // 1) Seller marks the listing sold, attributing it to the buyer.
  const sellerCtx = await browser.newContext();
  await sellerCtx.addCookies([
    { name: "session", value: await mintSession(seller.id), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
  const sp = await sellerCtx.newPage();
  await sp.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });

  // Open the mark-sold dialog robustly — the trigger is a client handler,
  // so re-click until the buyer <select> is actually visible (guards
  // against a click landing before hydration under parallel load).
  const select = sp.locator('select[name="buyerId"]');
  await expect(async () => {
    await sp.getByRole("button", { name: /Mark as sold/i }).first().click();
    await expect(select).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  // Attribute the sale to the buyer and confirm the value stuck before
  // submitting — otherwise the action silently takes the no-buyer path
  // (no review email), which is the real cause of the earlier flake.
  await select.selectOption(buyer.id);
  await expect(select).toHaveValue(buyer.id);
  await Promise.all([
    sp.waitForURL(/\/sold-thanks/, { timeout: 20_000 }),
    sp.locator('form:has(select[name="buyerId"]) button[type="submit"]').click(),
  ]);
  await sellerCtx.close();

  // 2) The buyer received a tokenised review link by email.
  let reviewUrl: string | undefined;
  await expect
    .poll(
      async () => {
        const mail = await getLastEmailTo(buyer.email);
        reviewUrl = mail?.html.match(
          /\/listings\/\d+\/review\/[A-Za-z0-9_-]+/,
        )?.[0];
        return reviewUrl ?? null;
      },
      { timeout: 30_000 },
    )
    .toBeTruthy();

  // 3) Buyer follows the link and submits a 5-star review.
  const buyerCtx = await browser.newContext();
  await buyerCtx.addCookies([
    { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
  ]);
  const bp = await buyerCtx.newPage();
  await bp.goto(reviewUrl!, { waitUntil: "networkidle" });
  await bp.getByRole("button", { name: "5 stars" }).click();
  await Promise.all([
    bp.waitForURL(/\/sellers\/\d+\?review=submitted/, { timeout: 20_000 }),
    bp.getByRole("button", { name: /Submit review/i }).click(),
  ]);
  await buyerCtx.close();

  // 4) The review is recorded against the seller.
  const rating = await getSellerRating(seller.id);
  expect(rating.count).toBe(1);
  expect(rating.average).toBe(5);
});

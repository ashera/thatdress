import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  cleanupUsers,
  countReviewTokens,
  createTestUser,
  getListing,
  getSellerRating,
  mintSession,
  seedConversation,
  seedListing,
  seedReviewToken,
} from "../support/db";

/**
 * Seller-review loop, split into its two deterministic halves so neither
 * depends on the email round-trip (the review link's plaintext token only
 * lives in the emailed message, and email capture is best-effort — that
 * dependency was the source of intermittent flake under load):
 *
 *  1. closeListingWithBuyer marks the listing sold to the buyer AND issues
 *     a review token (asserted via the DB row, not the email).
 *  2. submitListingReview records a rating against the seller when the
 *     buyer follows a valid token link (token minted directly in the DB).
 *
 * Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";
const REGION = "8";

test("marking a listing sold to a buyer issues a review token", async ({
  browser,
}) => {
  const seller = await createTestUser();
  const buyer = await createTestUser();
  const { listingId } = await seedListing(seller.id, {
    regionId: REGION,
    title: "E2E Review Sold Dress",
  });
  // A conversation makes the buyer attributable in the mark-sold dialog.
  await seedConversation(listingId, buyer.id, seller.id);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(seller.id), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
  const sp = await ctx.newPage();
  try {
    await sp.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });

    // Open the mark-sold dialog robustly (client trigger — re-click until
    // the buyer <select> is actually visible).
    const select = sp.locator('select[name="buyerId"]');
    await expect(async () => {
      await sp.getByRole("button", { name: /Mark as sold/i }).first().click();
      await expect(select).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    await select.selectOption(buyer.id);
    await expect(select).toHaveValue(buyer.id);
    await Promise.all([
      sp.waitForURL(/\/sold-thanks/, { timeout: 20_000 }),
      sp.locator('form:has(select[name="buyerId"]) button[type="submit"]').click(),
    ]);

    // The sale closed to this buyer and a review token was issued — both
    // committed before the redirect, so they're there now (no email needed).
    expect((await getListing(listingId))?.sold_at).toBeTruthy();
    expect(await countReviewTokens(listingId, buyer.id)).toBe(1);
  } finally {
    await cleanupUsers([seller.id, buyer.id]);
    await ctx.close();
  }
});

test("a buyer submits a review via a token link", async ({ browser }) => {
  const seller = await createTestUser();
  const buyer = await createTestUser();
  const { listingId } = await seedListing(seller.id, {
    regionId: REGION,
    title: "E2E Review Link Dress",
  });
  // Mint the tokenised review link directly (skips mark-sold + email).
  const token = randomBytes(24).toString("base64url");
  await seedReviewToken(listingId, buyer.id, token);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto(`/listings/${listingId}/review/${token}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "5 stars" }).click();
    await Promise.all([
      page.waitForURL(/\/sellers\/\d+\?review=submitted/, { timeout: 20_000 }),
      page.getByRole("button", { name: /Submit review/i }).click(),
    ]);

    const rating = await getSellerRating(seller.id);
    expect(rating.count).toBe(1);
    expect(rating.average).toBe(5);
  } finally {
    await cleanupUsers([seller.id, buyer.id]);
    await ctx.close();
  }
});

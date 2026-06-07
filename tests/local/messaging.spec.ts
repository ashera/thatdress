import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestUser,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Messaging + offers thread. A buyer contacts a seller and they exchange
 * messages in the conversation thread; the seller sees a buyer's offer in
 * the listing's "Offers received" panel. Exercises startConversation +
 * sendMessage (both directions), the /messages list, and offer visibility.
 * Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";
const REGION = "8"; // Melbourne (active locally)

let seller: TestUser;
let buyer: TestUser;
let listingId: string;

test.beforeAll(async () => {
  seller = await createTestUser();
  buyer = await createTestUser();
  ({ listingId } = await seedListing(seller.id, {
    regionId: REGION,
    priceCents: 20000,
    title: "E2E Message Dress",
  }));
});

test.afterAll(async () => {
  await cleanupUsers([seller.id, buyer.id]);
});

async function ctxFor(userId: string, browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(userId), url: BASE, httpOnly: true },
    { name: "region_id", value: REGION, url: BASE, httpOnly: true },
  ]);
  return ctx;
}

const bodyForm = (page: import("@playwright/test").Page) =>
  page.locator('form:has(textarea[name="body"]), form:has(input[name="body"])');

test("buyer and seller exchange messages in a thread", async ({ browser }) => {
  // Buyer opens a conversation from the listing and sends a message.
  const buyerCtx = await ctxFor(buyer.id, browser);
  const bp = await buyerCtx.newPage();
  await bp.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await Promise.all([
    bp.waitForURL(/\/messages\/\d+/, { timeout: 20_000 }),
    bp.getByRole("button", { name: /Contact seller/i }).click(),
  ]);
  const convId = bp.url().match(/\/messages\/(\d+)/)![1];

  const buyerMsg = "Hi, is the zip intact?";
  await bodyForm(bp).locator('[name="body"]').fill(buyerMsg);
  await bodyForm(bp).locator('button[type="submit"]').first().click();
  await expect(bp.getByText(buyerMsg).first()).toBeVisible();

  // Seller sees the conversation in their inbox and replies.
  const sellerCtx = await ctxFor(seller.id, browser);
  const sp = await sellerCtx.newPage();
  await sp.goto("/messages", { waitUntil: "networkidle" });
  await expect(sp.locator(`a[href="/messages/${convId}"]`).first()).toBeVisible();

  await sp.goto(`/messages/${convId}`, { waitUntil: "networkidle" });
  await expect(sp.getByText(buyerMsg).first()).toBeVisible();
  const reply = "Yes — zip and lining are perfect.";
  await bodyForm(sp).locator('[name="body"]').fill(reply);
  await bodyForm(sp).locator('button[type="submit"]').first().click();
  await expect(sp.getByText(reply).first()).toBeVisible();

  // Buyer sees the seller's reply.
  await bp.goto(`/messages/${convId}`, { waitUntil: "networkidle" });
  await expect(bp.getByText(reply).first()).toBeVisible();

  await buyerCtx.close();
  await sellerCtx.close();
});

test("a buyer's offer shows in the seller's Offers received", async ({ browser }) => {
  const buyerCtx = await ctxFor(buyer.id, browser);
  const bp = await buyerCtx.newPage();
  await bp.goto(`/listings/${listingId}/offer`, { waitUntil: "domcontentloaded" });
  await bp.fill('input[name="amount"]', "150");
  await Promise.all([
    bp.waitForURL(/\/messages\/\d+/, { timeout: 20_000 }),
    bp.getByRole("button", { name: /Send offer/i }).click(),
  ]);
  await buyerCtx.close();

  // The seller sees the offer on the listing detail page.
  const sellerCtx = await ctxFor(seller.id, browser);
  const sp = await sellerCtx.newPage();
  await sp.goto(`/listings/${listingId}`, { waitUntil: "networkidle" });
  await expect(sp.getByText(/Offers received/i)).toBeVisible();
  await expect(sp.getByText("$150").first()).toBeVisible();
  await sellerCtx.close();
});

import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  cleanupSandboxFor,
  cleanupUsers,
  createSandboxRegion,
  createTestUser,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";

/**
 * Isolation guarantees for the partner sandbox / Test Region. The seeded
 * sandbox listing must stay invisible on every public surface — browse
 * (anonymous + logged-in, in an active region), the home page, the
 * seller's public profile, and the sitemap — while a non-test control
 * listing in an active region stays visible. It must only appear to the
 * sandbox's owner from inside it (and to admins). Cookie forgery by a
 * non-owner must not grant access. Runs against the LOCAL app + DB.
 *
 * Serial so the shared sandbox/control fixtures are built once.
 */

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3000";
const REGION_COOKIE = "region_id";
const ACTIVE_REGION = "8"; // Melbourne (active locally)

const nonce = randomBytes(3).toString("hex");
const SANDBOX_TITLE = `E2E Sandbox Secret ${nonce}`;
const CONTROL_TITLE = `E2E Control Public ${nonce}`;

let owner: TestUser; // the prospect: owns the sandbox + a listing inside it
let buyer: TestUser; // an unrelated logged-in shopper
let admin: TestUser;
let sandboxRegionId: string;
let sandboxListingId: string;
let controlListingId: string;

const link = (id: string) => `a[href="/listings/${id}"]`;

test.beforeAll(async () => {
  owner = await createTestUser();
  buyer = await createTestUser();
  admin = await createTestUser({ isAdmin: true });

  ({ regionId: sandboxRegionId } = await createSandboxRegion(owner.id));
  ({ listingId: sandboxListingId } = await seedListing(owner.id, {
    regionId: sandboxRegionId,
    title: SANDBOX_TITLE,
  }));
  // Control: a normal public listing by the same owner in an active region.
  ({ listingId: controlListingId } = await seedListing(owner.id, {
    regionId: ACTIVE_REGION,
    title: CONTROL_TITLE,
  }));
});

test.afterAll(async () => {
  await cleanupSandboxFor(owner.id);
  await cleanupUsers([owner.id, buyer.id, admin.id]);
});

test("anonymous browse hides the sandbox listing, shows the control", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/listings", { waitUntil: "networkidle" });
  await expect(page.locator(link(sandboxListingId))).toHaveCount(0);
  await expect(page.locator(link(controlListingId))).not.toHaveCount(0);
  await ctx.close();
});

test("logged-in shopper in an active region never sees the sandbox", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
    { name: REGION_COOKIE, value: ACTIVE_REGION, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  await page.goto("/listings", { waitUntil: "networkidle" });
  await expect(page.locator(link(sandboxListingId))).toHaveCount(0);
  await expect(page.locator(link(controlListingId))).not.toHaveCount(0);
  await ctx.close();
});

test("the seller's public profile excludes their sandbox listing", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  // /sellers isn't region-gate-bypassed, so a viewer needs a resolved
  // (active) region to see the profile rather than the region picker.
  await ctx.addCookies([
    { name: REGION_COOKIE, value: ACTIVE_REGION, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  await page.goto(`/sellers/${owner.id}`, { waitUntil: "networkidle" });
  await expect(page.locator(link(sandboxListingId))).toHaveCount(0);
  await expect(page.locator(link(controlListingId))).not.toHaveCount(0);
  await ctx.close();
});

test("the sitemap omits the sandbox listing but lists the control", async ({
  request,
}) => {
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain(`/listings/${controlListingId}`);
  expect(body).not.toContain(`/listings/${sandboxListingId}`);
});

test("a forged region cookie does not let a non-owner into the sandbox", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(buyer.id), url: BASE, httpOnly: true },
    // Point the cookie straight at the sandbox region the buyer doesn't own.
    { name: REGION_COOKIE, value: sandboxRegionId, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();

  const resp = await page.goto(`/listings/${sandboxListingId}`);
  expect(resp?.status()).toBe(404);

  await page.goto("/listings", { waitUntil: "networkidle" });
  await expect(page.locator(link(sandboxListingId))).toHaveCount(0);
  await ctx.close();
});

test("the owner sees the sandbox listing from inside the sandbox", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(owner.id), url: BASE, httpOnly: true },
    { name: REGION_COOKIE, value: sandboxRegionId, url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();

  const resp = await page.goto(`/listings/${sandboxListingId}`);
  expect(resp?.status()).toBe(200);

  await page.goto("/listings", { waitUntil: "networkidle" });
  await expect(page.locator(link(sandboxListingId))).not.toHaveCount(0);
  await ctx.close();
});

test("an admin can see the sandbox listing (unscoped)", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  const resp = await page.goto(`/listings/${sandboxListingId}`);
  expect(resp?.status()).toBe(200);
  await ctx.close();
});

import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  mintSession,
  seedListing,
  type TestUser,
} from "../support/db";
import { randomBytes } from "node:crypto";

/**
 * Admin "show/hide sample & test data" filtering across the dresses,
 * listings and users consoles. Seeded sample accounts
 * (sample+…@frockd.test) are hidden by default and revealed with the
 * toggle (?samples=1 / ?sample=…). Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";

let admin: TestUser;
let realSeller: TestUser;
let sampleSeller: TestUser;
let partner: TestUser;
let region: { id: string; label: string };

const tag = randomBytes(3).toString("hex");
const REAL_TITLE = `E2E Real Listing ${tag}`;
const SAMPLE_TITLE = `E2E Sample Listing ${tag}`;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
  realSeller = await createTestUser();
  // A sample-marked account — matches the sample+%@frockd.test marker.
  sampleSeller = await createTestUser({
    email: `sample+e2e-${tag}@frockd.test`,
  });
  partner = await createTestUser({ isPartner: true });
  region = await createTestRegion();

  await seedListing(realSeller.id, { regionId: region.id, title: REAL_TITLE });
  await seedListing(sampleSeller.id, {
    regionId: region.id,
    title: SAMPLE_TITLE,
  });
});

test.afterAll(async () => {
  await cleanupUsers([admin.id, realSeller.id, sampleSeller.id, partner.id]);
  await deleteTestRegions([region.id]);
});

async function adminPage(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  return { ctx, page: await ctx.newPage() };
}

test("admin listings console hides sample listings by default", async ({
  browser,
}) => {
  const { ctx, page } = await adminPage(browser);
  try {
    await page.goto("/admin/listings", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(REAL_TITLE);
    await expect(page.locator("body")).not.toContainText(SAMPLE_TITLE);

    await page.goto("/admin/listings?samples=1", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(REAL_TITLE);
    await expect(page.locator("body")).toContainText(SAMPLE_TITLE);
  } finally {
    await ctx.close();
  }
});

test("admin dresses console hides sample-owned dresses by default", async ({
  browser,
}) => {
  const { ctx, page } = await adminPage(browser);
  try {
    await page.goto("/admin/dresses", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(realSeller.email);
    await expect(page.locator("body")).not.toContainText(sampleSeller.email);

    await page.goto("/admin/dresses?samples=1", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(sampleSeller.email);
  } finally {
    await ctx.close();
  }
});

test("admin users console filters by sample, type and region", async ({
  browser,
}) => {
  const { ctx, page } = await adminPage(browser);
  try {
    // Default: sample users hidden, real ones shown.
    await page.goto("/admin/users", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(realSeller.email);
    await expect(page.locator("body")).not.toContainText(sampleSeller.email);

    // Sample-only: the reverse.
    await page.goto("/admin/users?sample=only", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(sampleSeller.email);
    await expect(page.locator("body")).not.toContainText(realSeller.email);

    // Type = partner: only the partner, not the member seller.
    await page.goto("/admin/users?type=partner", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(partner.email);
    await expect(page.locator("body")).not.toContainText(realSeller.email);

    // Region filter: the seller with a listing there shows; the partner
    // (no listings in this region) does not.
    await page.goto(`/admin/users?region=${region.id}`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("body")).toContainText(realSeller.email);
    await expect(page.locator("body")).not.toContainText(partner.email);
  } finally {
    await ctx.close();
  }
});

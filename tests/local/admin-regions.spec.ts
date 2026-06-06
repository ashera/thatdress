import { test, expect } from "@playwright/test";
import {
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  getPartnerActivation,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Admin region management: an admin assigns a region's partner from the
 * region detail page (activating them with a free window), then unassigns
 * (demoting them). Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";

let admin: TestUser;
let target: TestUser;
let region: { id: string; label: string };

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
  target = await createTestUser();
  region = await createTestRegion();
});

test.afterAll(async () => {
  await cleanupUsers([admin.id, target.id]);
  await deleteTestRegions([region.id]);
});

test("admin can assign and unassign a region's partner", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();

  // Assign the region to the target user by email.
  await page.goto(`/admin/regions/${region.id}`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', target.email);
  await Promise.all([
    page.waitForURL(/done=assigned/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Assign partner/i }).click(),
  ]);

  let state = await getPartnerActivation(target.id, region.id);
  expect(state.isPartner).toBe(true);
  expect(state.freeInFuture).toBe(true);
  expect(state.platformFeePct).toBeGreaterThan(0);

  // Unassign — the partner is removed and (holding no other region) demoted.
  await Promise.all([
    page.waitForURL(/done=unassigned/, { timeout: 20_000 }),
    page.getByRole("button", { name: /^Unassign$/i }).click(),
  ]);

  state = await getPartnerActivation(target.id, region.id);
  expect(state.isPartner).toBe(false);
  expect(state.platformFeePct).toBeNull();
});

import { test, expect } from "@playwright/test";
import {
  cleanupSandboxFor,
  cleanupUsers,
  countListingsInRegion,
  createPartnerApplication,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  firstListingIdInRegion,
  getSandboxRegion,
  getUserIsPartner,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Partner sandbox ("Test Region"). An admin provisions a private sandbox
 * for a pending applicant from the Partner Applications page; the sandbox
 * is seeded with listings the prospect can browse inside it, but which
 * never leak to the public marketplace. Tearing it down cleans everything
 * up and demotes the prospect. Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";
const REGION_COOKIE = "region_id";

let admin: TestUser;
let prospect: TestUser;
let region: { id: string; label: string };
let appId: string;

test.beforeAll(async () => {
  admin = await createTestUser({ isAdmin: true });
  prospect = await createTestUser();
  region = await createTestRegion();
  appId = await createPartnerApplication(prospect.id, region.id);
});

test.afterAll(async () => {
  await cleanupSandboxFor(prospect.id);
  await cleanupUsers([admin.id, prospect.id]);
  await deleteTestRegions([region.id]);
});

test("admin provisions a private sandbox, then tears it down", async ({
  browser,
}) => {
  // --- Admin starts the sandbox from the applications page ---------------
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto("/admin/partner-applications", { waitUntil: "networkidle" });

  const card = adminPage.locator(".form-card").filter({ hasText: prospect.email });
  await Promise.all([
    adminPage.waitForURL(/done=sandbox-started/, { timeout: 20_000 }),
    card.getByRole("button", { name: /Start a sandbox/i }).click(),
  ]);

  const sandbox = await getSandboxRegion(prospect.id);
  expect(sandbox).not.toBeNull();
  expect(await countListingsInRegion(sandbox!.id)).toBeGreaterThan(0);
  expect(await getUserIsPartner(prospect.id)).toBe(true);

  const sandboxListingId = await firstListingIdInRegion(sandbox!.id);
  expect(sandboxListingId).not.toBeNull();

  // --- The sandbox is invisible to the public marketplace ---------------
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  await anonPage.goto("/listings", { waitUntil: "networkidle" });
  await expect(anonPage.getByText("Sandbox", { exact: false })).toHaveCount(0);
  // Direct link to a sandbox listing 404s for the public.
  const anonResp = await anonPage.goto(`/listings/${sandboxListingId}`);
  expect(anonResp?.status()).toBe(404);
  await anonCtx.close();

  // --- The prospect can only see it from *inside* the sandbox -----------
  const proCtx = await browser.newContext();
  await proCtx.addCookies([
    { name: "session", value: await mintSession(prospect.id), url: BASE, httpOnly: true },
  ]);
  const proPage = await proCtx.newPage();

  // Not yet in the sandbox (no region cookie) → the listing 404s.
  const outResp = await proPage.goto(`/listings/${sandboxListingId}`);
  expect(outResp?.status()).toBe(404);

  // Enter the sandbox (region cookie pointing at the owned test region).
  await proCtx.addCookies([
    { name: REGION_COOKIE, value: sandbox!.id, url: BASE, httpOnly: true },
  ]);
  const inResp = await proPage.goto(`/listings/${sandboxListingId}`);
  expect(inResp?.status()).toBe(200);
  // The global sandbox banner is up.
  await expect(proPage.getByText(/Sandbox mode/i)).toBeVisible();
  await proCtx.close();

  // --- Admin tears the sandbox down -------------------------------------
  await adminPage.goto("/admin/partner-applications", { waitUntil: "networkidle" });
  const card2 = adminPage.locator(".form-card").filter({ hasText: prospect.email });
  await Promise.all([
    adminPage.waitForURL(/done=sandbox-ended/, { timeout: 20_000 }),
    card2.getByRole("button", { name: /End sandbox/i }).click(),
  ]);

  expect(await getSandboxRegion(prospect.id)).toBeNull();
  expect(await countListingsInRegion(sandbox!.id)).toBe(0);
  expect(await getUserIsPartner(prospect.id)).toBe(false);

  await adminCtx.close();
});

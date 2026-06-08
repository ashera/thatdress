import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupSandboxFor,
  cleanupUsers,
  countListingsInRegion,
  createPartnerApplication,
  createSandboxRegion,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  firstListingIdInRegion,
  getListing,
  getSandboxRegion,
  getUserIsPartner,
  mintSession,
  seedListing,
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

  const row = adminPage.locator("tr").filter({ hasText: prospect.email });
  await Promise.all([
    adminPage.waitForURL(/done=sandbox-started/, { timeout: 20_000 }),
    row.getByRole("button", { name: /^Start$/i }).click(),
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
  const row2 = adminPage.locator("tr").filter({ hasText: prospect.email });
  await Promise.all([
    adminPage.waitForURL(/done=sandbox-ended/, { timeout: 20_000 }),
    row2.getByRole("button", { name: /^End$/i }).click(),
  ]);

  expect(await getSandboxRegion(prospect.id)).toBeNull();
  expect(await countListingsInRegion(sandbox!.id)).toBe(0);
  expect(await getUserIsPartner(prospect.id)).toBe(false);

  await adminCtx.close();
});

test("sandbox listings only appear in /partner/listings from inside the sandbox", async ({
  browser,
}) => {
  const owner = await createTestUser({ isPartner: true });
  const { regionId } = await createSandboxRegion(owner.id);
  await assignPartnerRegion(owner.id, regionId); // the sandbox grant
  const { listingId } = await seedListing(owner.id, {
    regionId,
    title: "E2E Sandbox-only Dress",
  });
  const link = `a[href="/listings/${listingId}"]`;

  try {
    // Outside the sandbox: the test region isn't one of the partner's
    // "real" regions, so its listings don't show (and can't 404 on click).
    const outCtx = await browser.newContext();
    await outCtx.addCookies([
      { name: "session", value: await mintSession(owner.id), url: BASE, httpOnly: true },
    ]);
    const outPage = await outCtx.newPage();
    await outPage.goto("/partner/listings", { waitUntil: "networkidle" });
    await expect(outPage.locator(link)).toHaveCount(0);
    await outCtx.close();

    // Inside the sandbox (region cookie set): the listing shows.
    const inCtx = await browser.newContext();
    await inCtx.addCookies([
      { name: "session", value: await mintSession(owner.id), url: BASE, httpOnly: true },
      { name: REGION_COOKIE, value: regionId, url: BASE, httpOnly: true },
    ]);
    const inPage = await inCtx.newPage();
    await inPage.goto("/partner/listings", { waitUntil: "networkidle" });
    await expect(inPage.locator(link).first()).toBeVisible();
    await inCtx.close();
  } finally {
    await cleanupSandboxFor(owner.id);
    await cleanupUsers([owner.id]);
    await deleteTestRegions([regionId]);
  }
});

test("deleting a sandbox region tears down its listings (no orphans)", async ({
  browser,
}) => {
  const owner = await createTestUser();
  const seller = await createTestUser();
  const { regionId } = await createSandboxRegion(owner.id);
  const { listingId } = await seedListing(seller.id, { regionId });
  expect(await countListingsInRegion(regionId)).toBe(1);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto(`/admin/regions/${regionId}`, { waitUntil: "networkidle" });

    // Open the "type DELETE to confirm" dialog robustly.
    const confirm = page.locator('dialog input[aria-label="Type DELETE to confirm"]');
    await expect(async () => {
      await page.getByRole("button", { name: /Delete region/i }).first().click();
      await expect(confirm).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await confirm.fill("DELETE");
    const submit = page.locator('dialog button[type="submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    // The region is gone AND its listing was deleted (not just detached) —
    // i.e. routed through teardownSandbox, leaving no orphans. Poll the DB
    // (the action does a soft client redirect).
    await expect
      .poll(async () => await getSandboxRegion(owner.id), { timeout: 20_000 })
      .toBeNull();
    expect(await getListing(listingId)).toBeNull();
  } finally {
    await cleanupUsers([owner.id, seller.id]);
    await deleteTestRegions([regionId]);
  }
});

test("a prospect can create their own sandbox from the apply page", async ({
  browser,
}) => {
  const u = await createTestUser();
  const r = await createTestRegion();
  await createPartnerApplication(u.id, r.id); // pending application

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(u.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto("/partners/apply", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Try it in a sandbox/i }),
    ).toBeVisible();

    await Promise.all([
      page.waitForURL(/sandbox=ready/, { timeout: 20_000 }),
      page.getByRole("button", { name: /Create my sandbox/i }).click(),
    ]);

    const sb = await getSandboxRegion(u.id);
    expect(sb).not.toBeNull();
    expect(await countListingsInRegion(sb!.id)).toBeGreaterThan(0);
    expect(await getUserIsPartner(u.id)).toBe(true);

    // The card now offers to enter the sandbox instead of creating one.
    await expect(
      page.getByRole("button", { name: /Enter your sandbox/i }),
    ).toBeVisible();
  } finally {
    await cleanupSandboxFor(u.id);
    await cleanupUsers([u.id]);
    await deleteTestRegions([r.id]);
  }
});

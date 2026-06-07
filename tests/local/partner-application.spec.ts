import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupUsers,
  createPartnerApplication,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  getPartnerActivation,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Partner Programme funnel: a prospect applies to run a region, an admin
 * approves, and the applicant is activated as a partner with the
 * 12-month free window. Runs against the LOCAL app + DB. Uses a throwaway
 * active region so there's always something free to apply for.
 */

const BASE = "http://localhost:3000";

let applicant: TestUser;
let admin: TestUser;
let region: { id: string; label: string };

test.beforeAll(async () => {
  applicant = await createTestUser();
  admin = await createTestUser({ isAdmin: true });
  region = await createTestRegion();
});

test.afterAll(async () => {
  await cleanupUsers([applicant.id, admin.id]);
  await deleteTestRegions([region.id]);
});

test("apply for a region, admin approves, partner is activated", async ({ browser }) => {
  // 1) Applicant submits an application for the region.
  const applicantCtx = await browser.newContext();
  await applicantCtx.addCookies([
    { name: "session", value: await mintSession(applicant.id), url: BASE, httpOnly: true },
  ]);
  const ap = await applicantCtx.newPage();
  await ap.goto("/partners/apply", { waitUntil: "networkidle" });
  await ap.check(`input[name="region_id"][value="${region.id}"]`);
  await ap.fill('input[name="business_name"]', "E2E Partner Co");
  await ap.fill('textarea[name="pitch"]', "I can bring 30 sellers in month one.");
  await Promise.all([
    ap.waitForURL(/submitted=1/, { timeout: 20_000 }),
    ap.getByRole("button", { name: /Submit application/i }).click(),
  ]);

  // Application is pending; not yet a partner.
  let state = await getPartnerActivation(applicant.id, region.id);
  expect(state.appStatus).toBe("pending");
  expect(state.isPartner).toBe(false);

  // 2) Admin approves the applicant's application from the region page
  //    (decisions live there now, not on the applications list).
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const mp = await adminCtx.newPage();
  await mp.goto(`/admin/regions/${region.id}`, { waitUntil: "networkidle" });
  await Promise.all([
    mp.waitForURL(/done=approved/, { timeout: 20_000 }),
    mp.getByRole("button", { name: /Approve & activate/i }).click(),
  ]);

  // 3) Activated: partner flag set, region granted, free window in the
  // future, platform fee snapshotted.
  state = await getPartnerActivation(applicant.id, region.id);
  expect(state.appStatus).toBe("approved");
  expect(state.isPartner).toBe(true);
  expect(state.freeInFuture).toBe(true);
  expect(state.platformFeePct).toBeGreaterThan(0);

  // 4) The new partner's dashboard shows the granted region.
  const dash = await applicantCtx.newPage();
  await dash.goto("/partner", { waitUntil: "domcontentloaded" });
  await expect(dash.getByText(region.label).first()).toBeVisible();
});

test("admin can delete a partner application", async ({ browser }) => {
  const u = await createTestUser();
  const r = await createTestRegion();
  await createPartnerApplication(u.id, r.id);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept()); // accept the delete confirm
  try {
    await page.goto("/admin/partner-applications", { waitUntil: "networkidle" });
    const row = page.locator("tr", { hasText: u.email });
    await Promise.all([
      page.waitForURL(/done=deleted/, { timeout: 20_000 }),
      row.getByRole("button", { name: /^Delete$/ }).click(),
    ]);

    // The application is gone.
    const state = await getPartnerActivation(u.id, r.id);
    expect(state.appStatus).toBeNull();
  } finally {
    await cleanupUsers([u.id]);
    await deleteTestRegions([r.id]);
  }
});

test("a prospect can cancel their own pending application", async ({
  browser,
}) => {
  const u = await createTestUser();
  const r = await createTestRegion();
  await createPartnerApplication(u.id, r.id);

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(u.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept()); // accept the cancel confirm
  try {
    await page.goto("/partners/apply", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Application under review/i }),
    ).toBeVisible();
    await Promise.all([
      page.waitForURL(/cancelled=1/, { timeout: 20_000 }),
      page.getByRole("button", { name: /Cancel application/i }).click(),
    ]);

    // The application is gone, and the region chooser is back.
    const state = await getPartnerActivation(u.id, r.id);
    expect(state.appStatus).toBeNull();
    await expect(page.locator('input[name="region_id"]').first()).toBeVisible();
  } finally {
    await cleanupUsers([u.id]);
    await deleteTestRegions([r.id]);
  }
});

test("a partner who already runs a region can't apply for another", async ({
  browser,
}) => {
  const partner = await createTestUser({ isPartner: true });
  const r = await createTestRegion();
  await assignPartnerRegion(partner.id, r.id); // now holds a real region

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(partner.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto("/partners/apply", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /You already run a region/i }),
    ).toBeVisible();
    // No region picker — they can't start another application.
    await expect(page.locator('input[name="region_id"]')).toHaveCount(0);
  } finally {
    await cleanupUsers([partner.id]);
    await deleteTestRegions([r.id]);
  }
});

test("admin can't approve a second region for an existing partner", async ({
  browser,
}) => {
  const partner = await createTestUser();
  const regionA = await createTestRegion();
  await assignPartnerRegion(partner.id, regionA.id); // already runs A
  const regionB = await createTestRegion();
  await createPartnerApplication(partner.id, regionB.id); // pending for B

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto(`/admin/regions/${regionB.id}`, { waitUntil: "networkidle" });
    await Promise.all([
      page.waitForURL(/error=already-partner/, { timeout: 20_000 }),
      page.getByRole("button", { name: /Approve & activate/i }).click(),
    ]);
    // B was not granted; the application is still pending.
    const state = await getPartnerActivation(partner.id, regionB.id);
    expect(state.appStatus).toBe("pending");
  } finally {
    await cleanupUsers([partner.id]);
    await deleteTestRegions([regionA.id, regionB.id]);
  }
});

test("a prospect can't apply for a region that's already assigned", async ({
  browser,
}) => {
  const partnerUser = await createTestUser({ isPartner: true });
  const r = await createTestRegion();
  await assignPartnerRegion(partnerUser.id, r.id); // region now taken
  const prospect = await createTestUser();

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(prospect.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto("/partners/apply", { waitUntil: "networkidle" });
    // The taken region is listed but its radio is disabled and flagged.
    const radio = page.locator(`input[name="region_id"][value="${r.id}"]`);
    await expect(radio).toBeDisabled();
    const label = page.locator(
      `label:has(input[name="region_id"][value="${r.id}"])`,
    );
    await expect(label.getByText(/Taken/i)).toBeVisible();
  } finally {
    await cleanupUsers([prospect.id, partnerUser.id]);
    await deleteTestRegions([r.id]);
  }
});

test("a prospect with a pending application can't open a second one", async ({
  browser,
}) => {
  const u = await createTestUser();
  const r = await createTestRegion();
  await createPartnerApplication(u.id, r.id); // already pending

  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: "session", value: await mintSession(u.id), url: BASE, httpOnly: true },
  ]);
  const page = await ctx.newPage();
  try {
    await page.goto("/partners/apply", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: /Application under review/i }),
    ).toBeVisible();
    // The region-picker form is gone — no second application can be started.
    await expect(page.locator('input[name="region_id"]')).toHaveCount(0);
  } finally {
    await cleanupUsers([u.id]);
    await deleteTestRegions([r.id]);
  }
});

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
  await ap.selectOption('select[name="region_id"]', region.id);
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

  // 2) Admin approves the applicant's application.
  const adminCtx = await browser.newContext();
  await adminCtx.addCookies([
    { name: "session", value: await mintSession(admin.id), url: BASE, httpOnly: true },
  ]);
  const mp = await adminCtx.newPage();
  await mp.goto("/admin/partner-applications", { waitUntil: "networkidle" });
  const card = mp.locator(".form-card", { hasText: applicant.email });
  await Promise.all([
    mp.waitForURL(/done=approved/, { timeout: 20_000 }),
    card.getByRole("button", { name: /Approve & activate/i }).click(),
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

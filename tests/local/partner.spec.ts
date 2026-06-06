import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupUsers,
  createTestRegion,
  createTestUser,
  deleteTestRegions,
  getRegionFeeCents,
  mintSession,
  type TestUser,
} from "../support/db";

/** Partner flow: a partner sets a listing fee for one of their marketing
 *  regions from the partner dashboard. Local app + DB.
 *  Uses a freshly-created active region rather than a shared seed region,
 *  so concurrent runs never contend over the unique region→partner slot. */

const BASE = "http://localhost:3000";
let user: TestUser;
let region: { id: string; label: string };

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
  if (region) await deleteTestRegions([region.id]);
});

test("partner can set a listing fee for their region", async ({ context, page }) => {
  user = await createTestUser({ isPartner: true });
  region = await createTestRegion();
  await assignPartnerRegion(user.id, region.id);
  await context.addCookies([
    { name: "session", value: await mintSession(user.id), url: BASE, httpOnly: true },
    { name: "region_id", value: region.id, url: BASE, httpOnly: true },
  ]);

  await page.goto("/partner", { waitUntil: "domcontentloaded" });
  await page.fill(`input[name="fee_${region.id}"]`, "15.00");
  await page.getByRole("button", { name: /Save listing fees/i }).click();

  // Poll for the persisted fee rather than racing an already-settled
  // networkidle wait against the server action's write.
  await expect
    .poll(async () => getRegionFeeCents(region.id), { timeout: 15_000 })
    .toBe(1500);
});

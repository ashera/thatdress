import { test, expect } from "@playwright/test";
import {
  assignPartnerRegion,
  cleanupUsers,
  createTestUser,
  getRegionFeeCents,
  mintSession,
  type TestUser,
} from "../support/db";

/** Partner flow: a partner sets a listing fee for one of their marketing
 *  regions from the partner dashboard. Local app + DB.
 *  Uses region 8 (Melbourne) — active and not claimed by seed data — so
 *  the global RegionGate resolves and shows the dashboard. */

const BASE = "http://localhost:3000";
const PARTNER_REGION = "8";
let user: TestUser;

test.afterAll(async () => {
  if (user) await cleanupUsers([user.id]);
});

test("partner can set a listing fee for their region", async ({ context, page }) => {
  user = await createTestUser({ isPartner: true });
  await assignPartnerRegion(user.id, PARTNER_REGION);
  await context.addCookies([
    { name: "session", value: await mintSession(user.id), url: BASE, httpOnly: true },
    { name: "region_id", value: PARTNER_REGION, url: BASE, httpOnly: true },
  ]);

  await page.goto("/partner", { waitUntil: "domcontentloaded" });
  await page.fill(`input[name="fee_${PARTNER_REGION}"]`, "15.00");
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.getByRole("button", { name: /Save listing fees/i }).click(),
  ]);

  expect(await getRegionFeeCents(PARTNER_REGION)).toBe(1500);
});

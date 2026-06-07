import { test, expect, type Page } from "@playwright/test";
import {
  cleanupUsers,
  countPublishedListings,
  createTestUser,
  mintSession,
  seedDraftListing,
  type TestUser,
} from "../support/db";

/**
 * Write-flow: a logged-in seller walks the listing wizard end to end and
 * publishes. Runs against the LOCAL app + local DB. Authenticates with a
 * minted session (the login UI is covered separately in auth.spec.ts) so
 * this test stays focused on the wizard. Cleans up the user + everything
 * the flow created afterwards.
 */

const BASE = "http://localhost:3000";
const REGION_ID = "8"; // Melbourne — an active region (the draft's region is
// taken from the resolved cookie, and only active regions resolve)

let user: TestUser;
let session: string;

test.beforeAll(async () => {
  user = await createTestUser();
  session = await mintSession(user.id);
});

test.afterAll(async () => {
  await cleanupUsers([user.id]);
});

async function clickAndNavigate(page: Page, name: RegExp | string) {
  const before = page.url();
  await Promise.all([
    page.waitForURL((u) => u.toString() !== before, { timeout: 20_000 }),
    page.getByRole("button", { name }).first().click(),
  ]);
  await page.waitForLoadState("networkidle");
}

async function pickFirstReal(page: Page, selectName: string) {
  const values = await page.$$eval(
    `select[name="${selectName}"] option`,
    (opts) => opts.map((o) => (o as HTMLOptionElement).value),
  );
  const real = values.find((v) => v && v !== "new");
  expect(real, `no option to select for ${selectName}`).toBeTruthy();
  await page.selectOption(`select[name="${selectName}"]`, real!);
}

test("seller can publish a listing through the wizard", async ({ context, page }) => {
  await context.addCookies([
    { name: "session", value: session, url: BASE, httpOnly: true },
    { name: "region_id", value: REGION_ID, url: BASE, httpOnly: true },
  ]);

  // Start a draft.
  await page.goto("/listings/mine", { waitUntil: "networkidle" });
  await clickAndNavigate(page, /Start a new listing/i);
  expect(page.url()).toMatch(/\/listings\/new\/\d+\/basics/);

  // Basics: designer + dress name.
  await pickFirstReal(page, "designer_id");
  await page.fill('input[name="model"]', "E2E Wizard Frock");
  await clickAndNavigate(page, /Save & continue/i);

  // Photos: continue without uploading (not required to publish).
  await clickAndNavigate(page, /Save & continue/i);

  // Style: occasion is required.
  await pickFirstReal(page, "occasion_id");
  await clickAndNavigate(page, /Save & continue/i);

  // Measurements: all optional.
  await clickAndNavigate(page, /Save & continue/i);

  // Condition: required.
  await pickFirstReal(page, "condition_id");
  await clickAndNavigate(page, /Save & continue/i);

  // Publish: price, postcode, authenticity declaration.
  expect(page.url()).toMatch(/\/listings\/new\/\d+\/publish/);
  await page.fill('input[name="price"]', "180");
  await page.fill('input[name="location_postal"]', "3000");
  await page.check('input[name="is_authentic_declared"]');
  await Promise.all([
    page.waitForURL(/\/listings\/\d+(\/first-publish-thanks)?$/, { timeout: 20_000 }),
    page.getByRole("button", { name: /Publish listing/i }).first().click(),
  ]);

  // The listing is live for this seller.
  expect(await countPublishedListings(user.id)).toBe(1);

  // And its detail page renders the title we built from designer + name.
  const m = page.url().match(/\/listings\/(\d+)/);
  expect(m).toBeTruthy();
  await page.goto(`/listings/${m![1]}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/E2E Wizard Frock/i).first()).toBeVisible();
});

test("a draft with no region can't be published", async ({ context, page }) => {
  const seller = await createTestUser();
  const { listingId } = await seedDraftListing(seller.id, { regionId: null });
  await context.addCookies([
    { name: "session", value: await mintSession(seller.id), url: BASE, httpOnly: true },
  ]);
  try {
    await page.goto(`/listings/new/${listingId}/publish`, { waitUntil: "networkidle" });
    await page.fill('input[name="price"]', "180");
    await page.fill('input[name="location_postal"]', "3000");
    await page.check('input[name="is_authentic_declared"]');
    await Promise.all([
      page.waitForURL(/error=region/, { timeout: 20_000 }),
      page.getByRole("button", { name: /Publish listing/i }).first().click(),
    ]);
    // Still a draft — the region guard blocked the publish.
    expect(await countPublishedListings(seller.id)).toBe(0);
  } finally {
    await cleanupUsers([seller.id]);
  }
});

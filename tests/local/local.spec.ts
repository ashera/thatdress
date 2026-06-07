import { test, expect } from "@playwright/test";

/**
 * Local suite — runs against the LOCAL app + local Postgres (baseURL set
 * by the `local` project in playwright.config.ts). Unlike the smoke
 * suite, these may exercise write flows against the local database.
 *
 * Phase 1 starts with a basic reachability check; richer write-flow
 * tests (auth, listing publish, etc.) get added here next.
 */

// Routes are pre-warmed in globalSetup, but allow extra headroom here as a
// belt-and-braces against a first-hit dev compile under parallel load.
test("local home page loads", async ({ page }) => {
  const res = await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(res, "no response from local server").toBeTruthy();
  expect(res!.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/frockd/i);
});

test("local browse listings loads", async ({ page }) => {
  const res = await page.goto("/listings", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(res!.status()).toBeLessThan(400);
});

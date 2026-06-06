import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the frockd test suite (see /admin/test-management).
 *
 * Two projects:
 *  - smoke: read-only checks against PRODUCTION (www.frockd.com.au).
 *  - local: write-flow checks against the LOCAL app + local Postgres.
 *
 * Results are written straight to Postgres by the custom reporter in
 * tests/reporter/db-reporter.ts (keyed by the RUN_ID env var when the
 * run is triggered from the admin UI; otherwise the reporter opens its
 * own run row so CLI runs are recorded too).
 *
 * Override a project's target with BASE_URL if needed.
 */
const PROD_URL = process.env.BASE_URL ?? "https://www.frockd.com.au";
const LOCAL_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["./tests/reporter/db-reporter.ts"]],
  use: {
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "smoke",
      testDir: "./tests/smoke",
      use: { ...devices["Desktop Chrome"], baseURL: PROD_URL },
    },
    {
      name: "local",
      testDir: "./tests/local",
      use: { ...devices["Desktop Chrome"], baseURL: LOCAL_URL },
    },
  ],
});

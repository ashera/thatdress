import { test, expect } from "@playwright/test";

/**
 * Smoke suite — read-only checks against PRODUCTION (baseURL set by the
 * `smoke` project in playwright.config.ts). These never write data: they
 * load key pages and assert they respond and render expected content.
 */

// Key public pages: each must respond < 400 and be branded "frockd".
const PUBLIC_PAGES: Array<{ path: string; name: string }> = [
  { path: "/", name: "home" },
  { path: "/listings", name: "browse listings" },
  { path: "/how-it-works", name: "how it works" },
  { path: "/tools", name: "tools" },
  { path: "/login", name: "login" },
  { path: "/register", name: "register" },
];

for (const p of PUBLIC_PAGES) {
  test(`${p.name} page loads`, async ({ page }) => {
    const res = await page.goto(p.path, { waitUntil: "domcontentloaded" });
    expect(res, `no response for ${p.path}`).toBeTruthy();
    expect(res!.status(), `bad status for ${p.path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(/frockd/i);
  });
}

test("home shows the hero call-to-action", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /browse listings/i }).first(),
  ).toBeVisible();
});

test("login page shows the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("sitemap.xml is served", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBeLessThan(400);
  expect(res.headers()["content-type"] ?? "").toContain("xml");
});

test("robots.txt is served", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBeLessThan(400);
});

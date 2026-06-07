import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import {
  cleanupUsers,
  createTestUser,
  ensureReferralCodeFor,
  findUserIdByEmail,
  getReferredBy,
  mintSession,
  type TestUser,
} from "../support/db";

/**
 * Referral programme. A member gets a personal referral link on
 * /profile/refer; a friend who arrives via that link (?ref=CODE, stamped
 * by middleware) and then registers is attributed back to the referrer.
 * Exercises ensureReferralCode, the middleware cookie capture, and the
 * register action's referral crediting. Runs against the LOCAL app + DB.
 */

const BASE = "http://localhost:3000";

let referrer: TestUser;
let code: string;

test.beforeAll(async () => {
  referrer = await createTestUser();
  code = await ensureReferralCodeFor(referrer.id);
});

test.afterAll(async () => {
  await cleanupUsers([referrer.id]);
});

test("a friend who signs up via a referral link is credited to the referrer", async ({
  browser,
}) => {
  // 1) The referrer opens their refer page, which generates + shows their
  //    personal share link (.../r/<code>).
  const refCtx = await browser.newContext();
  await refCtx.addCookies([
    { name: "session", value: await mintSession(referrer.id), url: BASE, httpOnly: true },
  ]);
  const refPage = await refCtx.newPage();
  await refPage.goto("/profile/refer", { waitUntil: "networkidle" });

  // The share link to /r/<code> is on the page.
  await expect(
    refPage.locator(`a[href*="/r/${code}"], input[value*="/r/${code}"]`).first(),
  ).toBeVisible();
  await refCtx.close();

  // 2) A friend arrives via ?ref=<code> (middleware stamps the cookie),
  //    then registers.
  const friendEmail = `e2e-ref-${Date.now()}-${randomBytes(2).toString("hex")}@frockd.test`;
  const friendCtx = await browser.newContext();
  const fp = await friendCtx.newPage();
  await fp.goto(`/?ref=${code}`, { waitUntil: "domcontentloaded" });
  // The attribution cookie is now set in the context.
  expect(
    (await friendCtx.cookies()).some((c) => c.name === "frockd_ref" && c.value === code),
  ).toBe(true);

  await fp.goto("/register", { waitUntil: "networkidle" });
  await fp.fill('input[name="email"]', friendEmail);
  await fp.fill('input[name="password"]', "Frockd123");
  await Promise.all([
    fp.waitForURL((u) => !/\/register/.test(u.pathname), { timeout: 20_000 }),
    fp.getByRole("button", { name: /Create account/i }).click(),
  ]);
  await friendCtx.close();

  // 3) The friend's account is attributed to the referrer.
  const friendId = await findUserIdByEmail(friendEmail);
  expect(friendId).toBeTruthy();
  try {
    expect(await getReferredBy(friendId!)).toBe(referrer.id);
  } finally {
    if (friendId) await cleanupUsers([friendId]);
  }
});

test("the /r/<code> landing routes on to /?ref=<code>", async ({ request }) => {
  // Fetch the raw HTML rather than loading it in a browser — the page
  // meta-refreshes immediately, so a real navigation would leave before we
  // could assert. The body carries the ?ref=<code> target (meta + link)
  // that the middleware reads to stamp the attribution cookie.
  const res = await request.get(`/r/${code}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toContain(`ref=${code}`);
});

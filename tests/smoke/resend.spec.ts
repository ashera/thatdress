import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Health check for the Resend email service. Calls the Resend API with
 * the configured key — a 200 means the key is valid and Resend is up
 * (a non-spammy proxy for "email can be sent"). Skips when no key is
 * available so the smoke suite still passes without one configured.
 *
 * To enable: put RESEND_API_KEY in .env.local (or the environment).
 */

function resolveResendKey(): string | null {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*RESEND_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

test("Resend API is reachable and the key is valid", async ({ request }) => {
  const key = resolveResendKey();
  test.skip(!key, "RESEND_API_KEY not configured — skipping Resend health check");

  const res = await request.get("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(
    res.status(),
    `Resend returned ${res.status()} (401 = bad key, 5xx = outage)`,
  ).toBe(200);
});

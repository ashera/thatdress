/**
 * Map a test to the area of the system it exercises, derived from its
 * spec file (falling back to the test key). Pure + framework-agnostic so
 * both the summary and detail pages classify identically.
 */

export type Suite = "smoke" | "local";

export const SUITES: Suite[] = ["smoke", "local"];

export function isSuite(s: string): s is Suite {
  return s === "smoke" || s === "local";
}

// First matching rule wins; matched against the spec's base filename
// (e.g. "partner-sandbox", "admin-users", "listing-detail").
const RULES: Array<[RegExp, string]> = [
  [/^maintenance/, "Admin"],
  [/^admin/, "Admin"],
  [/partner/, "Partner"],
  [/^auth/, "Auth"],
  [/account/, "Account"],
  [/buyer/, "Buyer"],
  [/seller/, "Seller"],
  [/listing/, "Listings"],
  [/messaging/, "Messaging"],
  [/review/, "Reviews"],
  [/referral/, "Referrals"],
  [/saved-search/, "Saved searches"],
  [/email|resend/, "Email"],
  [/support/, "Support"],
  [/smoke|^local$/, "Core"],
];

export function categorizeTest(file: string | null, testKey: string): string {
  const base = (file ?? testKey)
    .split(/[\\/]/)
    .pop()!
    .toLowerCase()
    .replace(/\.spec\.ts.*$/, "");
  for (const [re, cat] of RULES) {
    if (re.test(base)) return cat;
  }
  // Fallback: title-case the base filename.
  const words = base.replace(/[-_]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1) || "Other";
}

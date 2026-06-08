import "server-only";
import { SAMPLE_EMAIL_LIKE } from "@/lib/sample-data";
import { SANDBOX_SELLER_EMAIL_LIKE } from "@/lib/partner-sandbox";

/**
 * Helpers for the admin "show/hide sample & test data" toggle on the
 * dresses + listings consoles. "Sample/test data" means anything seeded
 * for demos or sandboxes:
 *   • sample users  — sample+…@frockd.test  (admin Sample Data tool)
 *   • sandbox users — sandbox+…@frockd.test (partner sandbox sample sellers)
 *   • anything sitting in a test region (regions.is_test = TRUE)
 *
 * The SQL fragments below are param-free (they inline only compile-time
 * constants, never user input) so they can be AND-ed straight into a WHERE,
 * mirroring excludeTestRegionsSql in @/lib/regions.
 */

/** Whether the admin asked to see sample/test rows. Default is hide, so the
 *  flag has to be explicitly set (?samples=1). */
export function showSamplesFromParam(value: string | undefined): boolean {
  return value === "1";
}

/** TRUE when the given email column belongs to a seeded sample/sandbox
 *  account. Null emails (e.g. a LEFT-JOINed seller) are not matched. */
export function sampleEmailSql(emailCol: string): string {
  return `(${emailCol} LIKE '${SAMPLE_EMAIL_LIKE}' OR ${emailCol} LIKE '${SANDBOX_SELLER_EMAIL_LIKE}')`;
}

/** TRUE when a listing (by alias) is seeded sample/test data: its seller is
 *  a sample/sandbox account, or it sits in a test region. Pass
 *  `sellerEmailCol` when the query already joins the seller's email (cheaper);
 *  otherwise the seller is resolved with a self-contained subquery so this can
 *  drop straight into any listings query without a join. */
export function listingIsSampleSql(
  listingAlias = "l",
  sellerEmailCol?: string,
): string {
  const sellerPart = sellerEmailCol
    ? sampleEmailSql(sellerEmailCol)
    : `EXISTS (
        SELECT 1 FROM users su_s
         WHERE su_s.id = ${listingAlias}.seller_id AND ${sampleEmailSql("su_s.email")}
      )`;
  return `(
    ${sellerPart}
    OR EXISTS (
      SELECT 1 FROM regions rg_s
       WHERE rg_s.id = ${listingAlias}.region_id AND rg_s.is_test
    )
  )`;
}

/** TRUE when a dress (by alias) is seeded sample/test data: its current
 *  owner or original creator is a sample/sandbox account, or any of its
 *  listings sits in a test region. `ownerEmailCol` is the joined
 *  current-owner email column for the query. */
export function dressIsSampleSql(
  dressAlias = "d",
  ownerEmailCol = "u.email",
): string {
  return `(
    ${sampleEmailSql(ownerEmailCol)}
    OR EXISTS (
      SELECT 1 FROM users cu_s
       WHERE cu_s.id = ${dressAlias}.created_by_user_id
         AND ${sampleEmailSql("cu_s.email")}
    )
    OR EXISTS (
      SELECT 1 FROM listings l_s
        JOIN regions rg_s ON rg_s.id = l_s.region_id
       WHERE l_s.dress_id = ${dressAlias}.id AND rg_s.is_test
    )
  )`;
}

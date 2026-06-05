"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withTransaction } from "@/lib/db";
import { requirePartner } from "@/lib/auth";
import { getPartnerMarketingRegionIds } from "@/lib/regions";

const MAX_FEE_CENTS = 100_000 * 100; // $100,000 ceiling — sanity guard.

/** Parse a dollar string into whole cents. Empty / blank / "0" → 0 (free).
 *  Returns null for anything that isn't a non-negative amount with up to
 *  two decimal places. */
function parseDollarsToCents(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const cents = Math.round(Number(v) * 100);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return Math.min(cents, MAX_FEE_CENTS);
}

/**
 * Partner self-service: set the listing fee for each of their marketing
 * regions. The form posts one `fee_<regionId>` field per region (dollar
 * amount; blank or 0 means free). We only touch rows the partner owns,
 * so a partner can never set a fee on someone else's region.
 */
export async function updatePartnerListingFees(
  formData: FormData,
): Promise<void> {
  const user = await requirePartner();
  const regionIds = await getPartnerMarketingRegionIds(user.id);

  for (const rid of regionIds) {
    const cents = parseDollarsToCents(String(formData.get(`fee_${rid}`) ?? ""));
    if (cents === null) {
      redirect("/partner?error=invalid-fee");
    }
  }

  await withTransaction(async (client) => {
    for (const rid of regionIds) {
      const cents =
        parseDollarsToCents(String(formData.get(`fee_${rid}`) ?? "")) ?? 0;
      await client.query(
        `UPDATE partner_marketing_regions
            SET listing_fee_cents = $3
          WHERE user_id = $1::bigint AND region_id = $2::bigint`,
        [user.id, rid, cents],
      );
    }
  });

  revalidatePath("/partner");
  redirect("/partner?saved=1");
}

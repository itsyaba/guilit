import { AUTOFILL_MIN_SAMPLE } from "@/lib/price-stats-config"
import { resolveBucket } from "@/lib/price-stats"
import type { ListingCondition, PriceSuggestion } from "@/lib/types"

/**
 * Price suggestions for the native posting flow, computed from listings we
 * already hold — never from the vision model, which has no idea what a used
 * Galaxy A54 goes for in Addis this month.
 *
 * This used to run its own percentile_cont query, one of three copies in the
 * codebase that could and did disagree with each other. It now reads the same
 * materialised buckets as the buyer-facing price check and the moderation
 * queue, so a seller and a buyer see one market, not two.
 *
 * It keeps a lower minimum than the buyer-facing range (AUTOFILL_MIN_SAMPLE vs
 * MIN_SAMPLE) on purpose — see the reasoning in lib/price-stats-config.ts.
 */
export async function suggestPrice(
  categorySlug: string,
  condition: ListingCondition | null
): Promise<PriceSuggestion | null> {
  if (!categorySlug) return null

  // The ladder applies the minimum at every rung, which closes a hole the old
  // implementation had: its category-wide fallback checked no sample size at
  // all and would happily report a "median" drawn from a single listing.
  const row = await resolveBucket({
    categorySlug,
    condition,
    minSample: AUTOFILL_MIN_SAMPLE,
  })
  if (!row) return null

  return {
    suggestedEtb: row.medianEtb,
    p25Etb: row.p25Etb,
    p75Etb: row.p75Etb,
    sampleSize: row.sampleSize,
    basis: row.scope === "category+condition" ? "category+condition" : "category",
  }
}

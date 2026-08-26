import type { PriceOutlier, PriceVerdict } from "@/lib/types"

/**
 * Thresholds and the verdict rule for price fairness.
 *
 * Deliberately free of any `@/db` import. lib/moderation.ts consumes these
 * constants and is itself imported by a client component
 * (app/admin/queue/components/queue-workspace.tsx), so a database import here
 * would drag postgres and DATABASE_URL into the browser bundle.
 */

/**
 * Buyer-facing minimum. Below this we show no range at all rather than a
 * misleading one — a "typical price" drawn from four listings is worse than
 * silence, because it looks authoritative.
 */
export const MIN_SAMPLE = 8

/**
 * Moderation reads the same table at a lower bar on purpose. A false "a human
 * should look at this" costs one glance; a false "this is the typical price"
 * shown to a buyer costs them a bad purchase. Same numbers, different cost of
 * being wrong, so different minimums.
 */
export const MODERATION_MIN_SAMPLE = 5

/**
 * The posting flow shows a seller a suggestion they can type over, in a UI that
 * already displays the sample size and how narrow the comparison was. That is
 * self-auditing in a way the buyer-facing range is not, so it keeps the looser
 * bar it has always had.
 */
export const AUTOFILL_MIN_SAMPLE = 5

/**
 * Outlier trimming only kicks in once a bucket is big enough for its quartiles
 * to mean something. Measured on our corpus: at n=8 the IQR is so tight that a
 * 3x fence ejects a legitimately expensive gaming PC, while at n=19 it
 * correctly ejects a car that had been mislabelled into phones. This is the
 * most sensitive knob in the feature — moving it changes every median.
 */
export const TRIM_MIN_SAMPLE = 12

/**
 * "70%+ below the category median" — the scam-routing rule from the README, and
 * the number lib/moderation.ts used to hardcode separately.
 */
export const PRICE_OUTLIER_RATIO = 0.3

export type PriceBucketStats = {
  medianEtb: number
  p25Etb: number
  p75Etb: number
  lowFenceEtb: number
  highFenceEtb: number
  /** Which rung of the widening ladder produced these numbers. */
  scope: string
}

/**
 * A scam warning is a like-for-like claim, so it needs a like-for-like bucket.
 *
 * "This iPhone costs 80% less than other iPhones" is evidence. "This bookshelf
 * costs 80% less than furniture in general" is not — it is just a bookshelf.
 * Measured on the real corpus: judging against category buckets flagged 40
 * listings, of which two were the planted scams and the rest were cheap items
 * in broad categories (a router in electronics, a motorcycle in vehicles).
 * Restricting to term buckets kept both scams and dropped the noise.
 *
 * The softer below/fair/above verdicts still work off any bucket — being under
 * the category p25 is a useful thing to say, it is just not an accusation.
 */
function supportsOutlierClaim(scope: string): boolean {
  return scope === "term" || scope === "term+condition"
}

/**
 * Where a price sits against its comparison bucket.
 *
 * Two low-side rules, unioned, because neither covers the other. The log-space
 * Tukey fence catches gross underpricing inside a tight bucket, where 30% of
 * the median is still a plausible asking price. The ratio rule catches it in a
 * wide bucket, where the fence has drifted far enough down to wave anything
 * through. Both were measured against the real corpus before being kept.
 *
 * `verdict: "above"` and `outlier: "high"` are not the same claim: the first is
 * merely past p75 and gets no special treatment, the second is far enough out
 * to be worth showing. Only the low side ever earns the amber warning, which is
 * the single place in the product colour is used that way.
 */
export function classifyPrice(
  priceEtb: number,
  stats: PriceBucketStats
): { verdict: PriceVerdict; outlier: PriceOutlier } {
  const precise = supportsOutlierClaim(stats.scope)

  if (
    precise &&
    (priceEtb < stats.lowFenceEtb ||
      priceEtb < stats.medianEtb * PRICE_OUTLIER_RATIO)
  ) {
    return { verdict: "suspicious", outlier: "low" }
  }
  if (precise && priceEtb > stats.highFenceEtb) {
    return { verdict: "above", outlier: "high" }
  }
  if (priceEtb < stats.p25Etb) return { verdict: "below", outlier: null }
  if (priceEtb > stats.p75Etb) return { verdict: "above", outlier: null }
  return { verdict: "fair", outlier: null }
}

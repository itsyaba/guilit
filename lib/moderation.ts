/**
 * Moderation routing rules — pure functions, no DB calls.
 *
 * Five rules from the Trust & Safety brief. The ingest pipeline sets
 * listing.status based on confidence alone (rule 1). The remaining four
 * rules are evaluated at queue-read time in the API layer using SQL
 * window functions and sub-queries. This module provides:
 *
 *   1. The shared QueueReason type used across the web layer
 *   2. getQueueReason() — evaluates all rules for a single item
 *   3. Label/colour helpers for rendering reason badges in the UI
 */

import { PRICE_OUTLIER_RATIO } from "@/lib/price-stats-config"

export type QueueReason =
  | "low_confidence"   // Rule 1: confidence < threshold
  | "price_outlier"    // Rule 2: price far below the comparable range
  | "flagged_phone"    // Rule 3: phone linked to a previously flagged listing
  | "report_threshold" // Rule 4: 3+ user reports
  | "borderline_dedup" // Rule 5: seen in >1 channel but confidence < 0.90
  | "new_seller"       // Native post from a new/flagged account (trust routing)

export type ModerationDecision =
  | "approve"
  | "approve_with_edits"
  | "reject"
  | "ban_channel"

export interface RoutingContext {
  confidenceScore: number
  priceEtb: number | null
  /** Median for this listing's bucket in price_stats — null when the bucket is
   *  too thin to judge against. */
  categoryMedianEtb: number | null
  /**
   * Log-space Tukey low fence for the same bucket, null when unavailable.
   * Catches gross underpricing inside a tight bucket, where 30% of the median
   * is still a plausible asking price and the ratio rule alone stays quiet.
   */
  priceLowFenceEtb?: number | null
  phoneNormalized: string | null
  /** True if this phone appears in any listing with status = 'removed' via report. */
  hasFlaggedPhone: boolean
  /** Count of reports.listingId = this listing. */
  reportCount: number
  seenInChannels: number
  /** Defaults to 0.80 (matches ingest/config.py AUTO_PUBLISH_CONFIDENCE_THRESHOLD). */
  confidenceThreshold?: number
  /** Fraction of median below which a price is flagged as an outlier. Defaults to 0.30. */
  priceOutlierRatio?: number
}

/**
 * Returns the first matching queue reason, or null if the item can be
 * auto-published. Rules are evaluated in priority order.
 */
export function getQueueReason(ctx: RoutingContext): QueueReason | null {
  const threshold = ctx.confidenceThreshold ?? 0.80
  const outlierRatio = ctx.priceOutlierRatio ?? PRICE_OUTLIER_RATIO

  // Rule 1 — confidence below threshold
  if (ctx.confidenceScore < threshold) return "low_confidence"

  // Rule 2 — price far below the comparable range. Two tests, unioned, matching
  // classifyPrice() so a moderator and a buyer never disagree about the same
  // listing: 70% below the median, or below the bucket's log-space low fence.
  if (
    ctx.priceEtb !== null &&
    ((ctx.categoryMedianEtb !== null &&
      ctx.categoryMedianEtb > 0 &&
      ctx.priceEtb < ctx.categoryMedianEtb * outlierRatio) ||
      (ctx.priceLowFenceEtb != null && ctx.priceEtb < ctx.priceLowFenceEtb))
  ) return "price_outlier"

  // Rule 3 — phone linked to a previously flagged listing
  if (ctx.hasFlaggedPhone) return "flagged_phone"

  // Rule 4 — 3+ user reports (already handled in the report route; re-checked here)
  if (ctx.reportCount >= 3) return "report_threshold"

  // Rule 5 — borderline dedup cluster (seen in >1 channel but not fully confident)
  if (ctx.seenInChannels > 1 && ctx.confidenceScore < 0.90) return "borderline_dedup"

  return null
}

// ---------------------------------------------------------------------------
// UI helpers — labels and colours for the reason badge
// ---------------------------------------------------------------------------

export const QUEUE_REASON_LABELS: Record<QueueReason, string> = {
  low_confidence:   "Low Confidence",
  price_outlier:    "Price Outlier",
  flagged_phone:    "Flagged Phone",
  report_threshold: "3+ Reports",
  borderline_dedup: "Dedup Cluster",
  new_seller:       "New Seller",
}

/** Tailwind-compatible class names for the badge. Uses the design-system tokens. */
export const QUEUE_REASON_CLASSES: Record<QueueReason, string> = {
  low_confidence:   "bg-zinc-100 text-zinc-700",
  price_outlier:    "bg-flag-surface text-flag-foreground",
  flagged_phone:    "bg-destructive/10 text-destructive",
  report_threshold: "bg-destructive/10 text-destructive",
  borderline_dedup: "bg-accent text-accent-foreground",
  new_seller:       "bg-primary/10 text-primary",
}

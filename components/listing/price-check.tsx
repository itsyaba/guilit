import { IconAlertTriangle } from "@tabler/icons-react"

import { formatAmount } from "@/lib/format"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Price fairness.
 *
 * A number on its own tells a first-time buyer nothing, so the asking price is
 * placed against the middle half of what this category actually sells for. The
 * amber state is the only place in the product that colour is used as a
 * warning, and it is reserved for prices far enough below the median to be a
 * common advance-payment scam signal.
 *
 * Statistics here come from the fixture file. The real median, p25 and p75 are
 * computed per category and condition by the price-stats job.
 */
export function PriceCheck({ listing }: { listing: Listing }) {
  const stats = listing.priceStats
  if (!stats || listing.priceEtb === null) return null

  const { p25Etb, p75Etb, categoryMedianEtb, verdict, sampleSize } = stats
  const price = listing.priceEtb

  // The track spans a little beyond the typical band so an outlier still lands
  // inside the frame instead of being clamped invisibly to an edge.
  const low = Math.min(p25Etb * 0.6, price * 0.9)
  const high = Math.max(p75Etb * 1.4, price * 1.1)
  const at = (value: number) =>
    `${Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100))}%`

  const delta = Math.round(((price - categoryMedianEtb) / categoryMedianEtb) * 100)
  const suspicious = verdict === "suspicious"

  const summary = suspicious
    ? "Far below what this category sells for. Ask why before you pay anything up front."
    : verdict === "below"
      ? `${Math.abs(delta)}% below the Addis median for ${listing.categoryLabel.toLowerCase()}.`
      : verdict === "above"
        ? `${delta}% above the Addis median for ${listing.categoryLabel.toLowerCase()}.`
        : "In line with what this category sells for in Addis."

  return (
    <section
      aria-label="Price check"
      className={cn(
        "rounded-lg border p-4",
        suspicious ? "border-flag/40 bg-flag-surface" : "border-border bg-card"
      )}
    >
      <h2
        className={cn(
          "type-ledger flex items-center gap-1.5",
          suspicious ? "text-flag-foreground" : "text-foreground"
        )}
      >
        {suspicious ? (
          <IconAlertTriangle aria-hidden="true" className="size-3.5" />
        ) : null}
        Price check
      </h2>

      <p
        className={cn(
          "mt-2 text-sm leading-relaxed",
          suspicious ? "text-flag-foreground" : "text-muted-foreground"
        )}
      >
        {summary}
      </p>

      <div className="relative mt-5 mb-2 h-1.5 rounded-full bg-muted">
        {/* The middle half of the market: where most of these actually sell. */}
        <div
          className="absolute inset-y-0 rounded-full bg-primary/25"
          style={{ left: at(p25Etb), right: `calc(100% - ${at(p75Etb)})` }}
        />
        {/* Median. */}
        <div
          className="absolute -top-1 h-3.5 w-px bg-muted-foreground"
          style={{ left: at(categoryMedianEtb) }}
        />
        {/* This listing. */}
        <div
          className={cn(
            "absolute -top-[5px] size-4 -translate-x-1/2 rounded-full border-2 border-background",
            suspicious ? "bg-flag" : "bg-primary"
          )}
          style={{ left: at(price) }}
        />
      </div>

      <div className="type-ledger flex justify-between text-muted-foreground">
        <span>{formatAmount(p25Etb)}</span>
        <span>median {formatAmount(categoryMedianEtb)}</span>
        <span>{formatAmount(p75Etb)}</span>
      </div>

      <p className="type-ledger mt-3 text-muted-foreground opacity-70">
        from {sampleSize} listings
      </p>
    </section>
  )
}

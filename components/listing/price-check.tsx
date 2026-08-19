"use client"

import * as React from "react"
import { IconAlertTriangle } from "@tabler/icons-react"

import { formatAmount } from "@/lib/format"
import type { PriceContext, PriceContextResponse } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Price fairness.
 *
 * A number on its own tells a first-time buyer nothing, so the asking price is
 * placed against the middle half of what comparable items actually sell for.
 * The amber state is the only place in the product colour is used as a warning,
 * and it is reserved for prices far enough below the typical range to be a
 * common advance-payment scam signal.
 *
 * Fetched rather than passed down. The statistics live in the price_stats table
 * and are rebuilt on a schedule, while listing pages are prerendered at build
 * time — reading them off the server-rendered listing would freeze the range at
 * whenever the page was built. See app/api/listings/[id]/price-context.
 *
 * Renders nothing until it has an answer, and nothing at all when the
 * comparison set is too thin. That is the honest outcome for a category we
 * don't have enough listings in yet, and it means no skeleton and no layout
 * shift in the sticky rail.
 */
export function PriceCheck({
  listingId,
  priceEtb,
}: {
  listingId: string
  priceEtb: number | null
}) {
  const [context, setContext] = React.useState<PriceContext | null>(null)

  React.useEffect(() => {
    if (priceEtb === null) return
    const controller = new AbortController()

    fetch(`/api/listings/${listingId}/price-context`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: PriceContextResponse | null) => {
        if (body?.available) setContext(body.context)
      })
      .catch(() => {
        // Aborted or offline. No range is the correct fallback, not an error.
      })

    return () => controller.abort()
  }, [listingId, priceEtb])

  if (!context) return null

  const { p25Etb, p75Etb, medianEtb, verdict, sampleSize, bucketLabel } = context
  const price = context.priceEtb

  // The track spans a little beyond the typical band so an outlier still lands
  // inside the frame instead of being clamped invisibly to an edge.
  const low = Math.min(p25Etb * 0.6, price * 0.9)
  const high = Math.max(p75Etb * 1.4, price * 1.1)
  const at = (value: number) =>
    `${Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100))}%`

  const delta = context.deltaFromMedianPct
  const suspicious = verdict === "suspicious"

  const summary = suspicious
    ? "Far below what comparable listings sell for. Ask why before you pay anything up front."
    : verdict === "below"
      ? `${Math.abs(delta)}% below the Addis median for ${bucketLabel}.`
      : verdict === "above"
        ? `${delta}% above the Addis median for ${bucketLabel}.`
        : `In line with what ${bucketLabel} sells for in Addis.`

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
          "type-mixed mt-2 text-sm leading-relaxed",
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
          style={{ left: at(medianEtb) }}
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
        <span>median {formatAmount(medianEtb)}</span>
        <span>{formatAmount(p75Etb)}</span>
      </div>

      <p className="type-ledger mt-3 text-muted-foreground opacity-70">
        from {sampleSize} comparable listings
      </p>
    </section>
  )
}

import { formatAmount } from "@/lib/format"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The dedup result, made visible on every card.
 *
 * The same sofa gets cross-posted to five channels. Collapsing those into one
 * row is the reason this product exists, so the evidence sits on the card
 * rather than hiding behind a click: one tick per sighting, height proportional
 * to the asking price at that channel, cheapest sighting picked out in the
 * accent, and the spread spelled out beside it.
 *
 * The slot is a fixed height in every state, so a grid of mixed listings never
 * shifts as it fills in.
 */
export function ProvenanceStrip({
  listing,
  className,
}: {
  listing: Listing
  className?: string
}) {
  const prices = listing.sources
    .map((source) => source.priceEtb)
    .filter((price): price is number => price !== null)

  const low = prices.length ? Math.min(...prices) : null
  const high = prices.length ? Math.max(...prices) : null
  const hasSpread = low !== null && high !== null && high > low

  let label: React.ReactNode

  if (listing.tier === "native") {
    label = "Posted on Gulit"
  } else if (listing.seenInChannels <= 1) {
    // Telegram handles are lowercase; uppercasing one makes it look wrong.
    label = (
      <span className="block truncate normal-case">
        @{listing.sources[0]?.channelHandle ?? "unknown"}
      </span>
    )
  } else if (hasSpread) {
    label = (
      <span className="truncate">
        {listing.seenInChannels} channels · {formatAmount(low)}–
        {formatAmount(high)}
      </span>
    )
  } else {
    label = <span className="truncate">Seen in {listing.seenInChannels} channels</span>
  }

  return (
    <div
      className={cn(
        "flex h-5 items-center gap-2 text-muted-foreground",
        className
      )}
    >
      <Ticks listing={listing} low={low} high={high} />
      <span className="type-ledger min-w-0">{label}</span>
    </div>
  )
}

function Ticks({
  listing,
  low,
  high,
}: {
  listing: Listing
  low: number | null
  high: number | null
}) {
  if (listing.tier === "native") {
    return (
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full bg-primary"
      />
    )
  }

  if (listing.seenInChannels <= 1) {
    return (
      <span
        aria-hidden="true"
        className="h-2.5 w-[3px] shrink-0 rounded-[1px] bg-border"
      />
    )
  }

  const span = low !== null && high !== null ? high - low : 0

  return (
    <span
      aria-hidden="true"
      className="flex h-3.5 shrink-0 items-end gap-[3px]"
    >
      {listing.sources.map((source, index) => {
        const price = source.priceEtb
        // Cheapest sighting is the shortest bar and the only one in the accent:
        // the eye lands on the price you should actually be paying.
        const ratio =
          price === null || low === null || span === 0 ? 0.5 : (price - low) / span
        const isLowest = price !== null && price === low

        return (
          <span
            key={`${source.channelHandle}-${index}`}
            style={{ height: `${6 + ratio * 8}px` }}
            className={cn(
              "w-[3px] rounded-[1px]",
              isLowest ? "bg-primary" : "bg-border"
            )}
          />
        )
      })}
    </span>
  )
}

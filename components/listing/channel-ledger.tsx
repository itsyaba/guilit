import { IconArrowUpRight } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
import { formatAmount, formatShortDate } from "@/lib/format"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Source attribution, in full.
 *
 * This is the same fact the card's provenance strip compresses: every channel
 * the item was seen in, what it cost there, when it was posted, and a link
 * straight back to the original message. It is the product's headline feature
 * and its legal posture in one table -- we index and attribute, we do not
 * republish, and the reader can always go and check.
 *
 * Rows are hairline-separated inside one core rather than being cards in a
 * list: they are readings of the same measurement, and a stack of boxes would
 * say they are unrelated items.
 */
export function ChannelLedger({ listing }: { listing: Listing }) {
  if (listing.sources.length === 0) return null

  const prices = listing.sources
    .map((source) => source.priceEtb)
    .filter((price): price is number => price !== null)
  const low = prices.length ? Math.min(...prices) : null
  const high = prices.length ? Math.max(...prices) : null
  const saving = low !== null && high !== null ? high - low : 0

  return (
    <section aria-labelledby="sources-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="sources-heading">
          <Eyebrow>
            Seen in {listing.seenInChannels}{" "}
            {listing.seenInChannels === 1 ? "channel" : "channels"}
          </Eyebrow>
        </h2>
        {saving > 0 ? (
          <p className="type-ledger text-muted-foreground">
            {formatAmount(saving)} ETB between cheapest and dearest
          </p>
        ) : null}
      </div>

      <Shell className="mt-4" coreClassName="overflow-hidden">
        <ul>
          {listing.sources.map((source, index) => {
            const isLowest = source.priceEtb !== null && source.priceEtb === low

            return (
              <li
                key={`${source.channelHandle}-${index}`}
                className="border-b border-hairline last:border-b-0"
              >
                <a
                  href={source.messageUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={cn(
                    "group/row flex items-center gap-4 px-5 py-4",
                    "transition-colors duration-500 ease-fluid hover:bg-tray/60",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  )}
                >
                  {/* The cheapest sighting is the only accented thing in the
                      table -- the eye lands on the price worth paying. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-8 w-[3px] shrink-0 rounded-full",
                      isLowest ? "bg-primary" : "bg-border"
                    )}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="type-mixed block truncate text-sm font-medium text-foreground">
                      {source.channelTitle}
                    </span>
                    <span className="type-ledger mt-1 block truncate text-muted-foreground normal-case">
                      @{source.channelHandle} ·{" "}
                      {formatShortDate(source.postedAt)}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block text-sm font-semibold tabular-nums",
                        isLowest ? "text-primary" : "text-foreground"
                      )}
                    >
                      {source.priceEtb === null
                        ? "—"
                        : `${formatAmount(source.priceEtb)} ETB`}
                    </span>
                    {isLowest && saving > 0 ? (
                      <span className="type-ledger mt-0.5 block text-primary">
                        cheapest
                      </span>
                    ) : null}
                  </span>

                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground",
                      "transition-transform duration-500 ease-fluid",
                      "group-hover/row:translate-x-0.5 group-hover/row:-translate-y-px group-hover/row:scale-105"
                    )}
                  >
                    <IconArrowUpRight stroke={1.5} className="size-4" />
                  </span>
                  <span className="sr-only">
                    Open the original post on Telegram
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      </Shell>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Gulit did not write these posts. Each row links to the message it came
        from, and contact goes to whoever posted it.
      </p>
    </section>
  )
}

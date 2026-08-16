import { IconExternalLink } from "@tabler/icons-react"

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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sources-heading" className="type-ledger text-foreground">
          Seen in {listing.seenInChannels}{" "}
          {listing.seenInChannels === 1 ? "channel" : "channels"}
        </h2>
        {saving > 0 ? (
          <p className="type-ledger text-muted-foreground">
            {formatAmount(saving)} ETB between the cheapest and dearest
          </p>
        ) : null}
      </div>

      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
        {listing.sources.map((source, index) => {
          const isLowest = source.priceEtb !== null && source.priceEtb === low

          return (
            <li key={`${source.channelHandle}-${index}`}>
              <a
                href={source.messageUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-6 w-[3px] shrink-0 rounded-[1px]",
                    isLowest ? "bg-primary" : "bg-border"
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="type-mixed block truncate text-sm text-foreground">
                    {source.channelTitle}
                  </span>
                  <span className="type-ledger block truncate normal-case text-muted-foreground">
                    @{source.channelHandle} · {formatShortDate(source.postedAt)}
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
                    <span className="type-ledger block text-primary">
                      cheapest
                    </span>
                  ) : null}
                </span>

                <IconExternalLink
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="sr-only">
                  Open the original post on Telegram
                </span>
              </a>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Gulit did not write these posts. Each row links to the message it came
        from, and contact goes to whoever posted it.
      </p>
    </section>
  )
}

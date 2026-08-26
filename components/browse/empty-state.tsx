import { IconSearchOff } from "@tabler/icons-react"

import { CtaLink, Shell } from "@/components/kit"

/**
 * An empty result set is a dead end unless it tells you how to get out of it.
 * This one names what was searched and offers the two moves that work.
 *
 * It is the same enclosure a full grid sits in, deliberately: an empty state
 * drawn as a dashed rectangle reads as a component that failed to load, which
 * is the opposite of the message.
 */
export function EmptyState({
  query,
  channelCount,
}: {
  query?: string
  channelCount: number
}) {
  return (
    <Shell coreClassName="flex flex-col items-center px-6 py-20 text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-tray ring-1 ring-hairline"
      >
        <IconSearchOff stroke={1.5} className="size-6 text-muted-foreground" />
      </span>
      <h2 className="type-display mt-6 text-xl font-semibold text-foreground sm:text-2xl">
        {query ? (
          <>
            Nothing matches{" "}
            <span className="type-mixed">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "Nothing matches these filters"
        )}
      </h2>
      <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
        We index {channelCount} Telegram channels and new items land throughout
        the day. Try widening your price range, clearing a filter, or searching
        for other keywords.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <CtaLink href="/browse">Clear all filters</CtaLink>
        <CtaLink href="/browse?sort=newest" tone="quiet">
          See what arrived today
        </CtaLink>
      </div>
    </Shell>
  )
}

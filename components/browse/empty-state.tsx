import Link from "next/link"
import { IconSearchOff } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

/**
 * An empty result set is a dead end unless it tells you how to get out of it.
 * This one names what was searched and offers the two moves that work.
 */
export function EmptyState({
  query,
  channelCount,
}: {
  query?: string
  channelCount: number
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-20 text-center">
      <IconSearchOff
        aria-hidden="true"
        className="size-7 text-muted-foreground"
      />

      <h2 className="mt-4 text-lg font-semibold text-foreground">
        {query ? (
          <>
            Nothing matches{" "}
            <span className="type-mixed">&ldquo;{query}&rdquo;</span>
          </>
        ) : (
          "Nothing matches these filters"
        )}
      </h2>

      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        We index {channelCount} Telegram channels and new items land throughout the
        day. Try widening your price range, clearing a filter, or searching for other keywords.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button render={<Link href="/browse" />} className="rounded-lg">
          Clear all filters
        </Button>
        <Button
          variant="outline"
          render={<Link href="/browse?sort=newest" />}
          className="rounded-lg"
        >
          See what arrived today
        </Button>
      </div>
    </div>
  )
}

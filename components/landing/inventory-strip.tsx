import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { ListingCard } from "@/components/listing/listing-card"
import { strings, type Lang } from "@/lib/i18n"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Real stock, immediately under the search field.
 *
 * A marketplace front page that shows no merchandise is a brochure. This is the
 * same `ListingCard` the browse grid uses -- not a marketing variant of it --
 * so the price, the tier tag, the no-photo state and the cross-post strip all
 * behave here exactly as they will on the results page one tap away.
 *
 * Server-rendered, and the first two cards carry `priority`: at 390px those are
 * the two that land above the fold, and they are the LCP candidate.
 */
/**
 * Two across on a phone, three up to 1024, then six in one row at full width --
 * so a card is ~173px at 390px and ~225px at 1440px, never the ~92vw the browse
 * grid asks for. Getting this wrong cost 260 KB of over-sized JPEG on the first
 * measurement.
 */
const STRIP_SIZES =
  "(min-width: 1280px) 225px, (min-width: 1024px) 24vw, (min-width: 640px) 31vw, 46vw"

export function InventoryStrip({
  listings,
  lang,
}: {
  listings: Listing[]
  lang: Lang
}) {
  const s = strings(lang)
  if (listings.length === 0) return null

  return (
    <section
      aria-labelledby="inventory-heading"
      className="border-b border-border"
    >
      <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2
              id="inventory-heading"
              className="type-display text-xl font-semibold text-foreground sm:text-2xl"
            >
              {s.inventoryTitle}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {s.inventoryLede}
            </p>
          </div>

          <Link
            href="/browse"
            className={cn(
              "group/all inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground",
              "transition-colors duration-500 ease-fluid hover:text-primary",
              "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            )}
          >
            {s.seeEverything}
            <IconArrowRight
              aria-hidden="true"
              stroke={1.5}
              className="size-4 transition-transform duration-500 ease-fluid group-hover/all:translate-x-0.5"
            />
          </Link>
        </div>

        {/*
         * Two across on a phone -- a single column would put one card and a lot
         * of nothing above the fold, and these cards survive a 170px measure.
         * Five across at full width, so the row reads as stock rather than as
         * four featured items.
         */}
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {listings.map((listing, index) => (
            <li key={listing.id} className="min-w-0">
              <ListingCard
                listing={listing}
                priority={index < 2}
                sizes={STRIP_SIZES}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

import { Band, Shell, TextLink } from "@/components/kit"
import { ListingCard } from "@/components/listing/listing-card"
import { formatAmount } from "@/lib/format"
import { strings, type Lang } from "@/lib/i18n"
import type { Listing } from "@/lib/types"

/**
 * Real stock, immediately under the search field.
 *
 * A marketplace front page that shows no merchandise is a brochure. This is the
 * same `ListingCard` the browse grid uses -- not a marketing variant of it --
 * so the price, the tier tag, the no-photo state and the cross-post strip all
 * behave here exactly as they will on the results page one tap away.
 *
 * What is new is the enclosure. The grid sits in a tray with a white core, a
 * ledger rail across the top and the channels it came out of along the bottom,
 * which is the slot a SaaS front page usually fills with a screenshot of its
 * own product. This one is the product, live, at the price the seller wrote.
 *
 * The card's own radius is nudged up from `rounded-lg` to `rounded-tile` from
 * the grid, not from the component: inside a 2rem enclosure a 4px corner reads
 * as a rendering mistake, and a marketing-only variant of the card is exactly
 * what this page must not grow.
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

/** How many source channels the footer rail names before it counts the rest. */
const HANDLE_LIMIT = 5

export function InventoryStrip({
  listings,
  lang,
}: {
  listings: Listing[]
  lang: Lang
}) {
  const s = strings(lang)
  if (listings.length === 0) return null

  // Free: the sources are already on the listings the grid is rendering, so
  // naming the channels costs no second query.
  const handles = Array.from(
    new Set(listings.flatMap((listing) => listing.sources.map((x) => x.channelHandle)))
  )
  const shown = handles.slice(0, HANDLE_LIMIT)
  const rest = handles.length - shown.length

  return (
    <Band
      labelledBy="inventory-heading"
      className="pt-2 pb-14 sm:pt-4 sm:pb-16 lg:pt-6 lg:pb-24"
    >
      <h2 id="inventory-heading" className="sr-only">
        {s.inventoryTitle}
      </h2>

      <Shell coreClassName="overflow-hidden">
        {/* The rail. The heading proper is above the fold in the hero, so this
            is a register line rather than a second title: what the grid is, and
            the way out of it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-hairline px-4 py-3.5 sm:px-5">
          <p className="type-ledger type-mixed min-w-0 text-muted-foreground">
            {s.inventoryTitle}
            {/* The lede is three wrapped lines of mono at 390px, which is a
                paragraph where a label belongs. It comes back at 640px. */}
            <span className="hidden sm:inline">
              <span aria-hidden="true" className="mx-2 text-muted-foreground/50">
                ·
              </span>
              <span className="normal-case">{s.inventoryLede}</span>
            </span>
          </p>

          <TextLink href="/browse">{s.seeEverything}</TextLink>
        </div>

        {/*
         * Two across on a phone -- a single column would put one card and a lot
         * of nothing above the fold, and these cards survive a 170px measure.
         * Six across at full width, so the row reads as stock rather than as
         * four featured items.
         */}
        <ul
          className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4 lg:grid-cols-4 xl:grid-cols-6"
        >
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

        {/*
         * Where the row came from, named. This is the slot a SaaS page fills
         * with customer logos; ours holds the Telegram channels that actually
         * carried these five items, which is the only claim we have and a
         * better one.
         */}
        {shown.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline bg-tray/50 px-4 py-3 sm:px-5">
            <p className="type-ledger type-mixed text-muted-foreground">
              {s.statChannels}
            </p>
            <ul className="flex min-w-0 flex-wrap items-center gap-2">
              {shown.map((handle) => (
                <li
                  key={handle}
                  className="rounded-full bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground ring-1 ring-hairline"
                >
                  @{handle}
                </li>
              ))}
              {rest > 0 ? (
                <li className="type-ledger text-muted-foreground">
                  +{formatAmount(rest)}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </Shell>
    </Band>
  )
}

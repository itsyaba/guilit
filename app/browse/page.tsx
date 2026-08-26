import type { Metadata } from "next"

import { EmptyState } from "@/components/browse/empty-state"
import { FilterBar } from "@/components/browse/filter-bar"
import { FilterPanel } from "@/components/browse/filter-panel"
import { Pagination } from "@/components/browse/pagination"
import { SortControl } from "@/components/browse/sort-control"
import { Eyebrow } from "@/components/kit"
import { ListingCard } from "@/components/listing/listing-card"
import {
  countActiveFilters,
  getFilterOptions,
  getListings,
  parseListingQuery,
  type RawSearchParams,
} from "@/lib/listings"
import { formatAmount } from "@/lib/format"
import { parseSearchQuery } from "@/lib/search-parse"

export const metadata: Metadata = {
  title: "Browse used goods in Addis Ababa",
  description:
    "Search second-hand listings collected from Telegram channels across Addis Ababa, with cross-posted duplicates collapsed into one row.",
}

/**
 * The results page.
 *
 * The measure is a two-column split rather than a full-bleed grid: filters sit
 * in their own tray down the left, pinned under the header, and the grid gets
 * the rest. The tray matters more than it looks -- on a near-white page a
 * column of form controls with no enclosure around it reads as page furniture
 * that someone forgot to finish, and the filters are half the product here.
 *
 * The heading block, the controls and the chips are one client component
 * (FilterBar) because they share the drawer's open state; the count and the
 * sort options arrive already rendered from here, so neither ships to the
 * browser.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = await searchParams
  const query = parseListingQuery(params)

  const [options, results, parsed] = await Promise.all([
    getFilterOptions(),
    getListings(query),
    // Re-read the parse for its suggestions only; the filters themselves are
    // already in the URL. SearchField wrote this cache row moments ago, so this
    // is a single indexed lookup, and doing it here rather than handing state
    // across from the client means suggestions survive a shared link and a page
    // load with JavaScript off. allowModel: false so a hand-typed URL that
    // misses the cache can never block the render on a third-party call.
    query.q
      ? parseSearchQuery(query.q, { allowModel: false })
      : Promise.resolve(null),
  ])

  const activeCount = countActiveFilters(query)

  return (
    <div className="mx-auto max-w-[90rem] px-4 pt-6 pb-20 sm:px-6 lg:pt-10 lg:pb-28">
      <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:gap-8 xl:gap-12">
        {/* Desktop sidebar. Sticks under the header so filters stay reachable
            while the grid scrolls, and scrolls internally when the form is
            taller than the viewport. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 min-w-0 rounded-shell bg-tray p-2 ring-1 ring-hairline">
            <div className="max-h-[calc(100svh-9rem)] min-w-0 overflow-y-auto rounded-panel bg-card p-5 shadow-ambient ring-1 ring-hairline">
              <h2 className="sr-only">Filters</h2>
              <Eyebrow tone="quiet" className="mb-6">
                Refine
              </Eyebrow>
              <FilterPanel options={options} query={query} />
            </div>
          </div>
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <FilterBar
            options={options}
            query={query}
            activeCount={activeCount}
            suggestions={parsed?.suggestions}
            heading={
              <>
                <Eyebrow dot>
                  {formatAmount(results.total)}{" "}
                  {results.total === 1 ? "listing" : "listings"}
                </Eyebrow>
                <h1
                  id="results-heading"
                  className="type-section type-display mt-4 max-w-[24ch] font-semibold text-foreground"
                >
                  {query.category
                    ? (options.categories.find(
                        (category) => category.slug === query.category
                      )?.label ?? "Listings")
                    : "Everything for sale in Addis"}
                </h1>
                <p className="type-ledger mt-3 text-muted-foreground">
                  Indexed from {results.channelCount} channels
                </p>
              </>
            }
            sort={<SortControl value={query.sort ?? "newest"} />}
          />

          {results.items.length === 0 ? (
            <EmptyState query={query.q} channelCount={results.channelCount} />
          ) : (
            <>
              {/*
               * Three across at 1280 rather than at 1024: with an 18rem tray
               * beside it, a third column at 1024 leaves each card 200px wide
               * and the price and the area end up on top of each other.
               *
               * The reveal is on the grid, not on each card. Twenty-four
               * scroll-driven timelines all resolving at once on a mid-range
               * Android buys one nice frame and drops the next ten.
               */}
              <ul className="anim-reveal grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {results.items.map((listing, index) => (
                  <li key={listing.id} className="min-w-0">
                    {/* Only the first row is eager; the rest is native lazy. */}
                    <ListingCard listing={listing} priority={index < 4} />
                  </li>
                ))}
              </ul>

              <Pagination
                page={results.page}
                pageCount={results.pageCount}
                prevCursor={results.prevCursor}
                nextCursor={results.nextCursor}
                params={params}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}

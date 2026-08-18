import type { Metadata } from "next"

import { EmptyState } from "@/components/browse/empty-state"
import { FilterPanel } from "@/components/browse/filter-panel"
import { FilterSheet } from "@/components/browse/filter-sheet"
import { Pagination } from "@/components/browse/pagination"
import { SortControl } from "@/components/browse/sort-control"
import { ListingCard } from "@/components/listing/listing-card"
import {
  countActiveFilters,
  getFilterOptions,
  getListings,
  parseListingQuery,
  type RawSearchParams,
} from "@/lib/listings"
import { formatAmount } from "@/lib/format"

export const metadata: Metadata = {
  title: "Browse used goods in Addis Ababa",
  description:
    "Search second-hand listings collected from Telegram channels across Addis Ababa, with cross-posted duplicates collapsed into one row.",
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const params = await searchParams
  const query = parseListingQuery(params)

  const [options, results] = await Promise.all([
    getFilterOptions(),
    getListings(query),
  ])

  const activeCount = countActiveFilters(query)

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8">
      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        {/* Desktop sidebar. Sticks under the header so filters stay reachable
            while the grid scrolls. */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-2 pb-2">
            <h2 className="sr-only">Filters</h2>
            <FilterPanel options={options} query={query} />
          </div>
        </aside>

        <section aria-labelledby="results-heading">
          <header className="mb-5 flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1
                id="results-heading"
                className="type-display text-xl font-semibold text-foreground sm:text-2xl"
              >
                {query.category
                  ? (options.categories.find(
                      (category) => category.slug === query.category
                    )?.label ?? "Listings")
                  : "Everything for sale in Addis"}
              </h1>
              <p className="type-ledger mt-1.5 text-muted-foreground">
                {formatAmount(results.total)} listings · indexed from{" "}
                {results.channelCount} channels
              </p>
            </div>

            <FilterSheet
              options={options}
              query={query}
              activeCount={activeCount}
            />
            <SortControl value={query.sort ?? "newest"} />
          </header>

          {results.items.length === 0 ? (
            <EmptyState query={query.q} channelCount={results.channelCount} />
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {results.items.map((listing, index) => (
                  <li key={listing.id}>
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

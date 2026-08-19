"use client"

import * as React from "react"

import { ActiveFilters } from "@/components/browse/active-filters"
import { FilterSheet } from "@/components/browse/filter-sheet"
import type { FilterOptions, ListingQuery, QuerySuggestion } from "@/lib/types"

/**
 * The results header and the filter chips beneath it.
 *
 * These live in one client component because they share a single piece of
 * state: removing a filter is a tap on a chip's x, but adjusting one — a price
 * ceiling especially — is not, so tapping a chip's label has to open the same
 * drawer the Filters button opens. On large screens the sidebar panel is always
 * visible, so there the label is inert and chips are remove-only.
 *
 * `heading` and `sort` arrive already rendered from the server component, which
 * keeps the listing count and the sort control out of the client bundle.
 */
export function FilterBar({
  options,
  query,
  activeCount,
  suggestions,
  heading,
  sort,
}: {
  options: FilterOptions
  query: ListingQuery
  activeCount: number
  suggestions?: QuerySuggestion[]
  heading: React.ReactNode
  sort: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">{heading}</div>
        <FilterSheet
          options={options}
          query={query}
          activeCount={activeCount}
          open={open}
          onOpenChange={setOpen}
        />
        {sort}
      </header>

      <ActiveFilters
        query={query}
        options={options}
        suggestions={suggestions}
        onEdit={() => setOpen(true)}
      />
    </>
  )
}

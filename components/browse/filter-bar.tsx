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
      {/*
       * The controls sit level with the bottom of the heading block rather than
       * with its top: the eyebrow, the h1 and the meta line are one object, and
       * a sort pill floating beside the eyebrow reads as part of the label
       * instead of as part of the grid below.
       */}
      <header className="anim-rise mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">{heading}</div>
        <div className="flex shrink-0 items-center gap-2">
          <FilterSheet
            options={options}
            query={query}
            activeCount={activeCount}
            open={open}
            onOpenChange={setOpen}
          />
          {sort}
        </div>
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

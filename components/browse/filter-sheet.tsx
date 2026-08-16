"use client"

import * as React from "react"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"

import { FilterPanel } from "@/components/browse/filter-panel"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import type { FilterOptions, ListingQuery } from "@/lib/types"

/**
 * On phones the sidebar becomes a bottom sheet. It swipes down to dismiss and
 * scrolls internally, so the filter form is reachable one-handed without ever
 * losing the results behind it.
 */
export function FilterSheet({
  options,
  query,
  activeCount,
}: {
  options: FilterOptions
  query: ListingQuery
  activeCount: number
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger
        render={
          <Button variant="outline" className="h-9 rounded-lg lg:hidden" />
        }
      >
        <IconAdjustmentsHorizontal aria-hidden="true" />
        Filters
        {activeCount > 0 ? (
          <span className="type-ledger ml-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background">
            {activeCount}
          </span>
        ) : null}
      </DrawerTrigger>

      <DrawerContent className="rounded-t-xl rounded-b-none">
        <DrawerHeader className="flex-row items-center justify-between border-b border-border pb-3 text-left">
          <DrawerTitle className="text-base">Filters</DrawerTitle>
          <DrawerClose
            render={
              <Button variant="ghost" size="sm" className="rounded-lg" />
            }
          >
            Close
          </DrawerClose>
        </DrawerHeader>

        <div className="overflow-y-auto overscroll-contain px-4 pt-5 pb-4">
          <FilterPanel
            options={options}
            query={query}
            onApplied={() => setOpen(false)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

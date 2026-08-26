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
import { cn } from "@/lib/utils"

/**
 * On phones the sidebar becomes a bottom sheet. It swipes down to dismiss and
 * scrolls internally, so the filter form is reachable one-handed without ever
 * losing the results behind it.
 */
export function FilterSheet({
  options,
  query,
  activeCount,
  open: controlledOpen,
  onOpenChange,
}: {
  options: FilterOptions
  query: ListingQuery
  activeCount: number
  /** Optional. Supplied by FilterBar so tapping a chip's label can open the
   *  sheet on the filter that chip represents; otherwise self-managed. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "h-11 rounded-full border-0 bg-card px-5 ring-1 ring-hairline lg:hidden",
              "transition-shadow duration-500 ease-fluid hover:shadow-hairline"
            )}
          />
        }
      >
        <IconAdjustmentsHorizontal aria-hidden="true" stroke={1.5} />
        Filters
        {activeCount > 0 ? (
          <span className="type-ledger -mr-1 ml-1 inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background">
            {activeCount}
          </span>
        ) : null}
      </DrawerTrigger>

      <DrawerContent className="rounded-t-shell rounded-b-none bg-card">
        <DrawerHeader className="flex-row items-center justify-between border-b border-hairline pb-3 text-left">
          <DrawerTitle className="type-display text-base">Filters</DrawerTitle>
          <DrawerClose
            render={
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
              />
            }
          >
            Close
          </DrawerClose>
        </DrawerHeader>

        <div className="overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
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

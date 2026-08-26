"use client"

import { usePathname } from "next/navigation"

import { CategoryRail } from "@/components/category-rail"
import { SearchField } from "@/components/search-field"
import type { CategoryOption } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The three pieces of chrome that depend on which route is rendering.
 *
 * The landing page has its own search field, and a second one in the header a
 * few hundred pixels above it made the whole bar look like a rendering bug. And
 * the bar itself is a floating pill there rather than a full-width rule, because
 * the front page is a composition and an edge-to-edge band across the top of it
 * cuts the hero's light in half.
 *
 * The category rail is the other way round: it is allowed on one route rather
 * than banned from one. It is a filter for a results grid, and it only reads as
 * a filter above the grid it filters -- on a listing page it is a row of twelve
 * links leading away from the item you just opened, and on /post it competes
 * with a form. Every chip in it navigates to /browse, so a rail on any other
 * route is a rail that has nothing to do with the page under it.
 *
 * All three rules live here so there is one place that knows what varies by
 * route, rather than a pathname check buried in three components.
 */
function isLanding(pathname: string) {
  return pathname === "/"
}

function isBrowse(pathname: string) {
  return pathname === "/browse"
}

/**
 * The header's frame.
 *
 * On a results page it is what it was: a full-width sticky bar with a hairline
 * under it, which is the right thing above a grid you are scrolling through.
 *
 * On the front page it detaches -- a pill, inset from all three edges, floating
 * over the hero wash. `backdrop-blur` is affordable on exactly this element and
 * on nothing else on the page: it is sticky, so the compositor keeps it on its
 * own layer instead of re-blurring a scrolling region every frame.
 */
export function HeaderFrame({ children }: { children: React.ReactNode }) {
  const landing = isLanding(usePathname())

  return (
    <header
      className={cn(
        "sticky top-0 z-40",
        landing
          ? "px-3 pt-3 sm:px-4 sm:pt-4"
          : "border-b border-hairline bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70"
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-4 sm:px-6",
          landing &&
            "max-w-[80rem] rounded-full bg-card/85 px-3 py-2 shadow-ambient ring-1 ring-hairline backdrop-blur supports-backdrop-filter:bg-card/70 sm:px-4"
        )}
      >
        {children}
      </div>
    </header>
  )
}

export function HeaderSearchSlot({ className }: { className?: string }) {
  if (isLanding(usePathname())) return null

  return <SearchField className={className} />
}

export function CategoryRailSlot({
  categories,
}: {
  categories: CategoryOption[]
}) {
  if (!isBrowse(usePathname())) return null

  return <CategoryRail categories={categories} />
}

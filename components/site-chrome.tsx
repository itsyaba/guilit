"use client"

import { usePathname } from "next/navigation"

import { CategoryRail } from "@/components/category-rail"
import { SearchField } from "@/components/search-field"
import type { CategoryOption } from "@/lib/types"

/**
 * The two pieces of header chrome that the front page does not want.
 *
 * The landing page has its own search field, and a second one in the header a
 * few hundred pixels above it made the whole bar look like a rendering bug. The
 * category rail is a filter for a results grid; on a page with no grid it is a
 * row of links competing with the hero for the first click.
 *
 * Both rules live here so there is one place that knows what the front page
 * hides, rather than a pathname check buried in two components.
 */
function isLanding(pathname: string) {
  return pathname === "/"
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
  if (isLanding(usePathname())) return null

  return <CategoryRail categories={categories} />
}

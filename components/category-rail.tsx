"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import type { CategoryOption } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Categories stay one tap away on every screen. On phones the rail scrolls
 * horizontally rather than collapsing into a menu -- tapping a visible chip is
 * faster than opening a sheet, and far faster than typing Amharic on a phone.
 */
export function CategoryRail({ categories }: { categories: CategoryOption[] }) {
  const params = useSearchParams()
  const active = params.get("category")

  const items = [{ slug: "", label: "All", labelAm: "ሁሉም" }, ...categories]

  return (
    <nav aria-label="Categories" className="border-b border-hairline bg-background">
      <ul className="no-scrollbar mx-auto flex max-w-[90rem] gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {items.map((category) => {
          const isActive = (active ?? "") === category.slug
          const href = category.slug
            ? `/browse?category=${category.slug}`
            : "/browse"

          return (
            <li key={category.slug || "all"}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-500 ease-fluid",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {category.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

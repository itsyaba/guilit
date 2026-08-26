"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconAntenna,
  IconChecklist,
  IconFlag,
  IconLayoutGrid,
  IconTrash,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  // `exact` on the index only. `/admin` is a prefix of every other route here,
  // so a startsWith test lights Overview up on all five pages at once.
  { href: "/admin", label: "Overview", icon: IconLayoutGrid, exact: true },
  { href: "/admin/queue", label: "Queue", icon: IconChecklist },
  { href: "/admin/reports", label: "Reports", icon: IconFlag },
  { href: "/admin/channels", label: "Channels", icon: IconAntenna },
  { href: "/admin/removals", label: "Removals", icon: IconTrash },
]

/**
 * The console's nav, in both orientations.
 *
 * Vertical it is a stack of pills in the sidebar tray; horizontal it is a
 * scrolling rail above the content on a phone. Same list, same active rule,
 * one component -- two would drift apart the first time a section was added.
 */
export function AdminNav({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal"
}) {
  const pathname = usePathname()
  const horizontal = orientation === "horizontal"

  return (
    <nav
      aria-label="Admin sections"
      className={cn(
        horizontal
          ? "-mx-1 no-scrollbar flex gap-1.5 overflow-x-auto px-1 py-0.5"
          : "flex flex-col gap-1"
      )}
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group/nav flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2.5 text-sm font-medium",
              "transition-[color,background-color,box-shadow] duration-500 ease-fluid",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              // Branched rather than layered: two background utilities in one
              // class list are resolved by stylesheet order, not by the order
              // they are written here, so "later wins" is not a thing you can
              // rely on. One background per state, chosen up front.
              isActive
                ? "bg-primary/8 text-foreground shadow-hairline ring-1 ring-hairline"
                : horizontal
                  ? "bg-card text-muted-foreground ring-1 ring-hairline hover:text-foreground"
                  : "text-muted-foreground hover:bg-tray hover:text-foreground",
              horizontal && "whitespace-nowrap"
            )}
          >
            <Icon
              aria-hidden="true"
              stroke={1.5}
              className={cn(
                "size-[18px] shrink-0",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

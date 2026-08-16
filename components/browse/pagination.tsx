import Link from "next/link"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { buildSearchParams, type RawSearchParams } from "@/lib/listings"
import { cn } from "@/lib/utils"

/**
 * Real links, so a page of results can be shared, bookmarked and opened in a
 * new tab. Page numbers are set in the ledger register like every other count
 * on the site.
 */
export function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number
  pageCount: number
  params: RawSearchParams
}) {
  if (pageCount <= 1) return null

  const href = (target: number) =>
    `/browse${buildSearchParams(params, {
      page: target === 1 ? undefined : String(target),
    })}`

  return (
    <nav
      aria-label="Results pages"
      className="flex items-center justify-center gap-1 pt-10"
    >
      <Step
        href={href(page - 1)}
        disabled={page === 1}
        label="Previous page"
        icon={<IconChevronLeft className="size-4" aria-hidden="true" />}
      />

      {pageWindow(page, pageCount).map((entry, index) =>
        entry === "gap" ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="type-ledger px-1 text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={href(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              "type-ledger inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              entry === page
                ? "bg-foreground text-background"
                : "border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {entry}
          </Link>
        )
      )}

      <Step
        href={href(page + 1)}
        disabled={page === pageCount}
        label="Next page"
        icon={<IconChevronRight className="size-4" aria-hidden="true" />}
      />
    </nav>
  )
}

function Step({
  href,
  disabled,
  label,
  icon,
}: {
  href: string
  disabled: boolean
  label: string
  icon: React.ReactNode
}) {
  const className =
    "inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

  if (disabled) {
    return (
      <span aria-hidden="true" className={cn(className, "opacity-35")}>
        {icon}
      </span>
    )
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {icon}
    </Link>
  )
}

/** First, last, current and its neighbours; gaps everywhere else. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  const visible = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b)

  const output: (number | "gap")[] = []
  let previous = 0
  for (const value of visible) {
    if (previous && value - previous > 1) output.push("gap")
    output.push(value)
    previous = value
  }
  return output
}

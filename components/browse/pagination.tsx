import Link from "next/link"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { buildSearchParams, type RawSearchParams } from "@/lib/listings"
import { cn } from "@/lib/utils"

/**
 * Prev/Next keyset pagination — not numbered jump-to-page links. Real cursor
 * pagination can only step to an adjacent page, not seek to an arbitrary
 * page number, without falling back to the OFFSET scan this was built to
 * avoid. "Page X of Y" is still shown; Y comes from a cheap COUNT(*), not
 * from walking rows.
 */
export function Pagination({
  page,
  pageCount,
  prevCursor,
  nextCursor,
  params,
}: {
  page: number
  pageCount: number
  prevCursor: string | null
  nextCursor: string | null
  params: RawSearchParams
}) {
  if (pageCount <= 1) return null

  const href = (cursor: string, targetPage: number) =>
    `/browse${buildSearchParams(params, { cursor, page: String(targetPage) })}`

  return (
    <nav
      aria-label="Results pages"
      className="flex items-center justify-center gap-3 pt-10"
    >
      <Step
        href={prevCursor ? href(prevCursor, page - 1) : undefined}
        label="Previous page"
        icon={<IconChevronLeft className="size-4" aria-hidden="true" />}
      />

      <span className="type-ledger px-1 text-muted-foreground">
        Page {page} of {pageCount}
      </span>

      <Step
        href={nextCursor ? href(nextCursor, page + 1) : undefined}
        label="Next page"
        icon={<IconChevronRight className="size-4" aria-hidden="true" />}
      />
    </nav>
  )
}

function Step({
  href,
  label,
  icon,
}: {
  href: string | undefined
  label: string
  icon: React.ReactNode
}) {
  const className =
    "inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

  if (!href) {
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

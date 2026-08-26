import Link from "next/link"
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react"

import { buildSearchParams, type RawSearchParams } from "@/lib/listings"
import { cn } from "@/lib/utils"

/**
 * Prev/Next keyset pagination — not numbered jump-to-page links. Real cursor
 * pagination can only step to an adjacent page, not seek to an arbitrary
 * page number, without falling back to the OFFSET scan this was built to
 * avoid. "Page X of Y" is still shown; Y comes from a cheap COUNT(*), not
 * from walking rows.
 *
 * The three controls sit in one tray so the pair reads as a single instrument
 * at the foot of the grid rather than as two buttons that drifted apart.
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
    <nav aria-label="Results pages" className="flex justify-center pt-14">
      <div className="flex items-center gap-1 rounded-full bg-tray p-1.5 ring-1 ring-hairline">
        <Step
          href={prevCursor ? href(prevCursor, page - 1) : undefined}
          label="Previous page"
          icon={<IconArrowLeft stroke={1.5} className="size-4" />}
        />

        <span className="type-ledger px-4 text-muted-foreground">
          Page {page} of {pageCount}
        </span>

        <Step
          href={nextCursor ? href(nextCursor, page + 1) : undefined}
          label="Next page"
          icon={<IconArrowRight stroke={1.5} className="size-4" />}
        />
      </div>
    </nav>
  )
}

/**
 * One step. The disabled end of the range is a span, not a dimmed link: there
 * is nothing at the other side of it, and a focusable control that does
 * nothing is worse than no control.
 */
function Step({
  href,
  label,
  icon,
}: {
  href: string | undefined
  label: string
  icon: React.ReactNode
}) {
  const className = cn(
    "inline-flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground",
    "shadow-hairline ring-1 ring-hairline",
    "transition-[color,box-shadow,transform] duration-500 ease-fluid",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
  )

  if (!href) {
    return (
      <span
        aria-hidden="true"
        className={cn(className, "bg-transparent opacity-35 shadow-none")}
      >
        {icon}
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        className,
        "hover:text-foreground hover:shadow-ambient active:scale-[0.96]"
      )}
    >
      {icon}
    </Link>
  )
}

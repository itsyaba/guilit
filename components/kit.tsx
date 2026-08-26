import Link from "next/link"
import { IconArrowRight, IconArrowUpRight } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * The product's shared furniture.
 *
 * Every surface that is not a listing detail page -- the front page's nine
 * bands, the results grid, the admin console -- draws its enclosures, labels
 * and calls to action from these six pieces, so the whole app reads as one
 * object rather than as three products that happened to ship together.
 *
 * Nothing here is a client component and nothing here takes a listener. It is
 * all server-renderable HTML, which is why the admin console and the browse
 * grid can use it without paying for a bundle.
 */
/**
 * A section's micro-label.
 *
 * The pill is the smallest type on the page and the only thing above a heading,
 * which is what makes a wall of bands scannable -- you can find "Price" without
 * reading the sentence next to it. `dot` adds the breathing indicator, and is
 * reserved for figures that are live out of Postgres.
 *
 * `tone` exists because the default pill is white with a hairline ring, which
 * is legible on the page and on a tray and invisible on the white core of a
 * panel -- there it reads as an empty button. Inside a core, use `quiet`.
 */
export function Eyebrow({
  children,
  dot = false,
  tone = "card",
  className,
}: {
  children: React.ReactNode
  dot?: boolean
  tone?: "card" | "quiet"
  className?: string
}) {
  return (
    <span
      className={cn(
        "type-ledger type-mixed inline-flex items-center gap-2 rounded-full px-3 py-1.5",
        "text-muted-foreground",
        tone === "quiet"
          ? "bg-tray"
          : "bg-card shadow-hairline ring-1 ring-hairline",
        className
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="anim-breathe size-1.5 shrink-0 rounded-full bg-primary"
        />
      ) : null}
      {children}
    </span>
  )
}

/**
 * The nested enclosure every panel on this page is built from: a recessed tray
 * with a white core sitting inside it, both hairlined, their radii one padding
 * step apart so the curves stay concentric.
 *
 * A card dropped flat onto the page background is the thing that makes a light
 * layout look unfinished, and on a near-white page a border alone cannot carry
 * the separation -- the tray is what gives the core an edge to sit against.
 */
export function Shell({
  children,
  tone = "tray",
  className,
  coreClassName,
}: {
  children: React.ReactNode
  /** `accent` tints the tray with the one accent, for the two CTA panels. */
  tone?: "tray" | "accent"
  className?: string
  coreClassName?: string
}) {
  return (
    <div
      className={cn(
        // `min-w-0` is load-bearing, not tidiness: these enclosures hold
        // `truncate` rows of Amharic post text, and a grid or flex child keeps
        // `min-width: auto` by default -- one nowrap line then widens the track
        // past the viewport and the whole page scrolls sideways on a phone.
        "min-w-0 rounded-shell p-2 ring-1 ring-hairline",
        tone === "accent" ? "bg-primary/8" : "bg-tray",
        className
      )}
    >
      <div
        className={cn(
          "min-w-0 rounded-panel bg-card shadow-ambient ring-1 ring-hairline",
          coreClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * The primary call to action.
 *
 * The trailing arrow sits in its own circle flush with the pill's inner
 * padding, and on hover the circle -- not the button -- moves: the button
 * presses down by a hair and the arrow leaves diagonally, which reads as
 * something with a mechanism inside it rather than a rectangle changing colour.
 *
 * A styled `Link`, not our `Button`: base-ui's Button is a client component and
 * pulling it in to render an anchor would ship the library to a page whose only
 * real buttons live inside two islands that already have their own.
 */
export function CtaLink({
  href,
  children,
  tone = "solid",
  className,
}: {
  href: string
  children: React.ReactNode
  tone?: "solid" | "quiet"
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/cta inline-flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-6 text-sm font-medium",
        "transition-[transform,background-color,box-shadow] duration-500 ease-fluid",
        "active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
        tone === "solid"
          ? "bg-primary text-primary-foreground shadow-ambient hover:shadow-lift"
          : "bg-card text-foreground shadow-hairline ring-1 ring-hairline hover:shadow-ambient",
        className
      )}
    >
      <span>{children}</span>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          "transition-transform duration-500 ease-fluid",
          "group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px group-hover/cta:scale-105",
          tone === "solid" ? "bg-primary-foreground/18" : "bg-foreground/6"
        )}
      >
        <IconArrowUpRight stroke={1.5} className="size-4" />
      </span>
    </Link>
  )
}

/**
 * The quiet version: a text link that carries its arrow half a step to the
 * right on hover. Used wherever a band points at the results grid.
 */
export function TextLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/link inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground",
        "transition-colors duration-500 ease-fluid hover:text-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
        className
      )}
    >
      {children}
      <IconArrowRight
        aria-hidden="true"
        stroke={1.5}
        className="size-4 transition-transform duration-500 ease-fluid group-hover/link:translate-x-0.5"
      />
    </Link>
  )
}

/**
 * A band's outer frame: the vertical rhythm and the measure, in one place.
 *
 * The old page separated every section with a full-width hairline, which is why
 * it read as a stack of strips. The separation here is space -- a lot of it --
 * and the reveal animation, which is a scroll-driven CSS animation with no
 * observer behind it.
 */
export function Band({
  children,
  id,
  labelledBy,
  label,
  className,
  innerClassName,
}: {
  children: React.ReactNode
  id?: string
  labelledBy?: string
  label?: string
  className?: string
  innerClassName?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      aria-label={label}
      className={cn("py-14 sm:py-16 lg:py-24", className)}
    >
      <div
        className={cn(
          "anim-reveal mx-auto max-w-[90rem] px-4 sm:px-6",
          innerClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * The heading block a band opens with: eyebrow, heading, lede. Optionally with
 * something pinned to the right of it on wide screens -- a "see everything"
 * link, usually -- which is why it is a flex row rather than three stacked
 * children.
 */
export function BandHead({
  eyebrow,
  title,
  titleId,
  lede,
  aside,
  align = "start",
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  titleId?: string
  lede?: React.ReactNode
  aside?: React.ReactNode
  align?: "start" | "center"
  className?: string
}) {
  const centred = align === "center"

  return (
    <div
      className={cn(
        "flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between",
        centred && "sm:flex-col sm:items-center",
        className
      )}
    >
      <div className={cn("min-w-0", centred && "text-center")}>
        <Eyebrow>{eyebrow}</Eyebrow>

        <h2
          id={titleId}
          className={cn(
            "type-section type-display mt-5 font-semibold text-foreground",
            centred ? "mx-auto max-w-[26ch] text-balance" : "max-w-[22ch]"
          )}
        >
          {title}
        </h2>

        {lede ? (
          <p
            className={cn(
              "mt-4 text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]",
              centred ? "mx-auto max-w-xl" : "max-w-xl"
            )}
          >
            {lede}
          </p>
        ) : null}
      </div>

      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  )
}

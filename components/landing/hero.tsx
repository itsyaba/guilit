import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { HeroSearch } from "@/components/landing/hero-search"
import { formatAmount } from "@/lib/format"
import { formatAgo, strings, type Lang } from "@/lib/i18n"
import type { LandingStats } from "@/lib/landing"
import { cn } from "@/lib/utils"

/**
 * Phrases a shopper can tap, kept in their original scripts in both languages.
 *
 * The middle one is the case the incumbents handle worst and the shape most of
 * our supply is written in: an Amharic noun with an English price qualifier.
 */
const EXAMPLES = [
  "laptop in Bole under 20000",
  "ላፕቶፕ under 20000",
  "iPhone under 40000",
] as const

/**
 * The front page above the fold.
 *
 * The search field is the object on this screen, not an accessory under a
 * headline: it is the widest, tallest and highest-contrast thing here, it is
 * focused on load on a desktop, and the first row of real stock sits directly
 * under it rather than behind a scroll.
 *
 * No gradient wash and no eyebrow pill. Both were decoration that cost a paint
 * and told a visitor nothing, and the space they used is now the top of the
 * inventory grid, which tells them everything.
 */
export function LandingHero({
  stats,
  lang,
}: {
  stats: LandingStats
  lang: Lang
}) {
  const s = strings(lang)
  const empty = stats.liveListings === 0

  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 pt-12 pb-10 text-center sm:px-6 lg:pt-16 lg:pb-12">
        <h1 className="type-display text-[2rem] leading-[1.1] font-semibold text-balance text-foreground sm:text-[2.75rem]">
          {empty ? s.freshTitle : s.heroTitle}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
          {empty ? s.freshLede : s.heroLede}
        </p>

        <HeroSearch
          examples={EXAMPLES}
          label={s.searchLabel}
          placeholder={s.searchPlaceholder}
          action={s.searchAction}
          className="mx-auto mt-8"
        />

        {/*
         * The live line. Capture age sits in the same breath as the counts
         * rather than in a separate reassurance below them, because a count
         * without a date is the number a dead pipeline also shows.
         */}
        {empty ? null : (
          <p className="type-ledger mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>
              {formatAmount(stats.liveListings)} {s.statListings}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {formatAmount(stats.channelCount)} {s.statChannels}
            </span>
            <span aria-hidden="true">·</span>
            {/* Labelled, not bare. "2 days ago" on its own beside two counts
                reads as ambiguous -- it could be the newest listing's age. */}
            <span>
              {stats.lastCapturedAt
                ? s.capturedAgo(formatAgo(stats.lastCapturedAt, lang))
                : s.noCaptureYet}
            </span>
          </p>
        )}

        {empty ? null : (
          <p className="mt-6">
            <Link
              href="/browse"
              className={cn(
                "group/all inline-flex items-center gap-1.5 text-sm font-medium text-foreground",
                "transition-colors duration-500 ease-fluid hover:text-primary",
                "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              )}
            >
              {s.browseAll(formatAmount(stats.liveListings))}
              <IconArrowRight
                aria-hidden="true"
                stroke={1.5}
                className="size-4 transition-transform duration-500 ease-fluid group-hover/all:translate-x-0.5"
              />
            </Link>
          </p>
        )}
      </div>
    </section>
  )
}

import Link from "next/link"

import { formatAmount } from "@/lib/format"
import { strings, type Lang } from "@/lib/i18n"
import type { LandingCategory } from "@/lib/landing"
import { cn } from "@/lib/utils"

/**
 * Where most people start, as a stock list rather than a tile wall.
 *
 * This replaced five stock photographs of somebody else's sofa. A used-goods
 * marketplace has exactly one thing it must never do with imagery, and stock
 * artwork at category level is a soft version of it -- it also cost ~490 KB on a
 * page whose audience is on metered mobile data, to say "furniture" next to a
 * word already saying "furniture".
 *
 * What a shopper actually wants from this section is which categories have
 * enough stock to be worth opening, and that is a number. Counts come out of
 * Postgres per render, so a category that empties out stops being advertised
 * instead of sitting there as a link to an empty grid.
 */
export function CategoryTable({
  categories,
  lang,
}: {
  categories: LandingCategory[]
  lang: Lang
}) {
  const s = strings(lang)
  if (categories.length === 0) return null

  return (
    <section
      aria-labelledby="categories-heading"
      className="border-b border-border"
    >
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <h2
          id="categories-heading"
          className="type-display max-w-[26ch] text-2xl font-semibold text-foreground sm:text-3xl"
        >
          {s.categoriesTitle}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          {s.categoriesLede}
        </p>

        {/*
         * Two columns of rows, not a grid of boxes. The count is right-aligned
         * and tabular so the eye can run down the numbers, which is the only
         * comparison anybody makes here.
         */}
        <ul className="mt-8 grid border-t border-border sm:grid-cols-2 sm:gap-x-10">
          {categories.map((category) => (
            <li key={category.slug} className="border-b border-border">
              <Link
                href={`/browse?category=${category.slug}`}
                className={cn(
                  "group flex items-baseline justify-between gap-4 py-3.5",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                )}
              >
                <span
                  // The label switches language; the slug in the href does not.
                  lang={lang}
                  className={cn(
                    "min-w-0 truncate text-[0.9375rem] text-foreground",
                    "transition-colors duration-500 ease-fluid group-hover:text-primary"
                  )}
                >
                  {lang === "am" ? category.labelAm : category.label}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {formatAmount(category.liveListings)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

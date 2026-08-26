import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { Band, BandHead, Shell, TextLink } from "@/components/kit"
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
 *
 * Two columns of rows inside one enclosure, not a grid of boxes: a box around
 * each row would give ten equal cards where the only thing being compared is
 * the number on the right.
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
    <Band labelledBy="categories-heading">
      <BandHead
        eyebrow={s.eyebrowCategories}
        title={s.categoriesTitle}
        titleId="categories-heading"
        lede={s.categoriesLede}
        aside={<TextLink href="/browse">{s.seeEverything}</TextLink>}
      />

      <Shell className="mt-10 lg:mt-12" coreClassName="overflow-hidden">
        <ul className="grid sm:grid-cols-2">
          {categories.map((category) => (
            <li
              key={category.slug}
              className={cn(
                "border-b border-hairline last:border-b-0",
                // The middle rule of the two-column layout, and only there:
                // odd children are the left column. An odd category count
                // leaves the last row half empty, and a rule beside nothing
                // reads as a missing row rather than as a divider.
                "sm:odd:border-r sm:odd:border-hairline sm:odd:last:border-r-0"
              )}
            >
              <Link
                href={`/browse?category=${category.slug}`}
                className={cn(
                  "group flex items-center justify-between gap-4 px-4 py-4 sm:px-5",
                  "transition-colors duration-500 ease-fluid hover:bg-tray/60",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
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
                  <IconArrowRight
                    aria-hidden="true"
                    stroke={1.5}
                    className={cn(
                      "size-4 shrink-0 text-primary opacity-0",
                      "transition-[opacity,transform] duration-500 ease-fluid",
                      "group-hover:translate-x-0.5 group-hover:opacity-100"
                    )}
                  />
                </span>

                {/* Right-aligned and tabular so the eye can run down the
                    numbers, which is the only comparison anybody makes here. */}
                <span className="shrink-0 rounded-full bg-tray px-2.5 py-1 text-xs text-muted-foreground tabular-nums ring-1 ring-hairline">
                  {formatAmount(category.liveListings)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Shell>
    </Band>
  )
}

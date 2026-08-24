import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { strings, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * What the parser does, shown as the parser doing it.
 *
 * Each row is a phrase on the left and the filters it resolves to on the right,
 * and the filters are live links to that exact browse URL. Every one of these
 * was run through /api/search/parse: the chips are what came back, not what we
 * wish came back. Tap one and you land on the filtered grid, which is the only
 * claim about parsing worth making.
 *
 * The phrases stay in their original scripts in both languages -- that a
 * half-Amharic sentence resolves the same as an English one is the point, and
 * translating the examples would erase it.
 */
const PARSES = [
  {
    phrase: "laptop in Bole under 20000",
    href: "/browse?category=computers&area=Bole&maxPrice=20000",
    chips: ["Computers", "Bole", "up to 20,000"],
  },
  {
    phrase: "ላፕቶፕ under 20000",
    href: "/browse?category=computers&maxPrice=20000",
    chips: ["Computers", "up to 20,000"],
  },
  {
    phrase: "iPhone under 40000",
    href: "/browse?q=iphone&category=phones&maxPrice=40000",
    chips: ["Phones & Tablets", "iphone", "up to 40,000"],
  },
] as const

/**
 * The three spellings of a sofa. Amharic, English and the Latin
 * transliteration people actually type resolve to the same query, which is the
 * difference between a search box and a search box that works here.
 */
const SPELLINGS = ["ሶፋ", "sofa", "soffa"] as const

export function SearchIntelligence({ lang }: { lang: Lang }) {
  const s = strings(lang)

  return (
    <section aria-labelledby="search-heading" className="border-b border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <h2
          id="search-heading"
          className="type-display max-w-[24ch] text-2xl font-semibold text-foreground sm:text-3xl"
        >
          {s.searchTitle}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          {s.searchLede}
        </p>

        <ul className="mt-8 max-w-4xl divide-y divide-border border-t border-border">
          {PARSES.map((parse) => (
            <li key={parse.phrase}>
              <Link
                href={parse.href}
                className={cn(
                  "group flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:gap-6",
                  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                )}
              >
                <span
                  lang="am"
                  className="min-w-0 font-mono text-sm text-foreground sm:w-64 sm:shrink-0"
                >
                  {parse.phrase}
                </span>

                <IconArrowRight
                  aria-hidden="true"
                  stroke={1.5}
                  className="hidden size-4 shrink-0 text-muted-foreground transition-transform duration-500 ease-fluid group-hover:translate-x-0.5 sm:block"
                />

                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {parse.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-4xl border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors duration-500 ease-fluid group-hover:border-foreground/25"
                    >
                      {chip}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex flex-wrap items-center gap-2">
            {SPELLINGS.map((spelling) => (
              <span
                key={spelling}
                lang="am"
                className="rounded-4xl bg-secondary px-3 py-1 text-sm text-secondary-foreground"
              >
                {spelling}
              </span>
            ))}
          </span>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {s.spellingsNote}
          </p>
        </div>
      </div>
    </section>
  )
}

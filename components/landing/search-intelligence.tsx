import Link from "next/link"
import { IconArrowRight } from "@tabler/icons-react"

import { Band, Eyebrow } from "@/components/kit"
import { strings, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * What the parser does, shown as the parser doing it.
 *
 * Each card is a phrase and the filters it resolves to, and the filters are live
 * links to that exact browse URL. Every one of these was run through
 * /api/search/parse: the chips are what came back, not what we wish came back.
 * Tap one and you land on the filtered grid, which is the only claim about
 * parsing worth making.
 *
 * The phrases stay in their original scripts in both languages -- that a
 * half-Amharic sentence resolves the same as an English one is the point, and
 * translating the examples would erase it.
 *
 * Three cores in one tray, rather than three separate cards: they are one
 * demonstration read top to bottom, and giving each its own shell would say
 * they were three unrelated features.
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
    <Band labelledBy="search-heading">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
        <div className="min-w-0">
          <Eyebrow>{s.eyebrowSearch}</Eyebrow>

          <h2
            id="search-heading"
            className="type-section type-display mt-5 max-w-[20ch] font-semibold text-foreground"
          >
            {s.searchTitle}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
            {s.searchLede}
          </p>

          {/* The same noun, three ways, one result set. */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            {SPELLINGS.map((spelling) => (
              <span
                key={spelling}
                lang="am"
                className="rounded-full bg-card px-3 py-1.5 text-sm text-foreground shadow-hairline ring-1 ring-hairline"
              >
                {spelling}
              </span>
            ))}
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {s.spellingsNote}
          </p>
        </div>

        {/* ---- the parses, three cores in one tray ------------------------ */}
        <div className="min-w-0 rounded-shell bg-tray p-2 ring-1 ring-hairline">
          <ul className="space-y-2">
            {PARSES.map((parse) => (
              <li key={parse.phrase}>
                <Link
                  href={parse.href}
                  className={cn(
                    "group flex flex-col gap-4 rounded-panel bg-card p-5 shadow-hairline ring-1 ring-hairline sm:p-6",
                    "transition-[transform,box-shadow] duration-500 ease-fluid",
                    "hover:-translate-y-px hover:shadow-ambient active:translate-y-0",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  )}
                >
                  <span className="flex items-center justify-between gap-4">
                    <span
                      lang="am"
                      className="min-w-0 truncate font-mono text-sm text-foreground"
                    >
                      {parse.phrase}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground ring-1 ring-hairline",
                        "transition-[transform,color] duration-500 ease-fluid",
                        "group-hover:translate-x-0.5 group-hover:text-foreground"
                      )}
                    >
                      <IconArrowRight stroke={1.5} className="size-4" />
                    </span>
                  </span>

                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    {parse.chips.map((chip) => (
                      <span
                        key={chip}
                        className={cn(
                          "rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground",
                          "transition-colors duration-500 ease-fluid"
                        )}
                      >
                        {chip}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  )
}

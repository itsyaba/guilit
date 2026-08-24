import { Suspense } from "react"
import Link from "next/link"

import { SessionStatus } from "@/components/auth/session-status"
import { LanguageToggle } from "@/components/language-toggle"
import { CategoryRailSlot, HeaderSearchSlot } from "@/components/site-chrome"
import { Wordmark } from "@/components/wordmark"
import { buttonVariants } from "@/components/ui/button"
import { getLang, strings } from "@/lib/i18n"
import { getFilterOptions } from "@/lib/listings"

/**
 * One bar, three zones: identity on the left, search in the middle, actions on
 * the right. The actions group is pinned right with an auto margin rather than
 * an order shuffle, so it stays on the right edge on the front page too, where
 * there is no search field to fill the middle.
 *
 * On phones the search field wraps onto its own row and the actions stay beside
 * the wordmark. Two rows of 44px targets beats a hamburger holding four items.
 */
export async function SiteHeader() {
  const [{ categories }, lang] = await Promise.all([
    getFilterOptions(),
    getLang(),
  ])
  const s = strings(lang)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-x-4 sm:px-6">
          <Wordmark />

          <Suspense
            fallback={
              <div className="order-last h-10 w-full md:order-none md:flex-1" />
            }
          >
            <HeaderSearchSlot className="order-last w-full md:order-none md:mx-2 md:w-auto md:max-w-2xl md:flex-1" />
          </Suspense>

          <nav
            aria-label="Main"
            className="ml-auto flex items-center gap-2.5 sm:gap-4"
          >
            <Link
              href="/browse"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:inline"
            >
              {s.navBrowse}
            </Link>

            <LanguageToggle />

            <Suspense fallback={<div className="h-5 w-12" />}>
              <SessionStatus />
            </Suspense>

            {/* The label is the first thing to give up room on a 390px
                screen, so the bar stays one row instead of wrapping. */}
            <Link
              href="/post"
              className={buttonVariants({ size: "sm" })}
            >
              <span className="sm:hidden">{s.sellShort}</span>
              <span className="hidden sm:inline">{s.sellAction}</span>
            </Link>
          </nav>
        </div>
      </header>

      <Suspense fallback={null}>
        <CategoryRailSlot categories={categories} />
      </Suspense>
    </>
  )
}

import { Suspense } from "react"
import Link from "next/link"

import { SessionStatus } from "@/components/auth/session-status"
import { LanguageToggle } from "@/components/language-toggle"
import {
  CategoryRailSlot,
  HeaderFrame,
  HeaderSearchSlot,
} from "@/components/site-chrome"
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
 *
 * The frame -- full-width bar on a results page, floating pill on the front page
 * -- is the one part that has to know the route, so it lives in site-chrome with
 * the other two pathname rules.
 */
export async function SiteHeader() {
  const [{ categories }, lang] = await Promise.all([
    getFilterOptions(),
    getLang(),
  ])
  const s = strings(lang)

  return (
    <>
      <HeaderFrame>
        <Wordmark className="ml-1 sm:ml-2" />

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
            className="hidden text-sm font-medium text-muted-foreground transition-colors duration-500 ease-fluid hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:inline"
          >
            {s.navBrowse}
          </Link>

          {/* Pills, to match the rest of the chrome: the toggle's own children
              are square-cornered by default and this is the only place the
              control sits inside another rounded object. */}
          <LanguageToggle className="rounded-full border-hairline [&_button]:rounded-full" />

          <Suspense fallback={<div className="h-5 w-12" />}>
            <SessionStatus />
          </Suspense>

          {/* The label is the first thing to give up room on a 390px
              screen, so the bar stays one row instead of wrapping. */}
          <Link
            href="/post"
            className={buttonVariants({
              size: "sm",
              className: "rounded-full shadow-hairline",
            })}
          >
            <span className="sm:hidden">{s.sellShort}</span>
            <span className="hidden sm:inline">{s.sellAction}</span>
          </Link>
        </nav>
      </HeaderFrame>

      <Suspense fallback={null}>
        <CategoryRailSlot categories={categories} />
      </Suspense>
    </>
  )
}

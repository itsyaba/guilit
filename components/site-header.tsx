import { Suspense } from "react"
import Link from "next/link"

import { CategoryRail } from "@/components/category-rail"
import { SessionStatus } from "@/components/auth/session-status"
import { LanguageToggle } from "@/components/language-toggle"
import { SearchField } from "@/components/search-field"
import { Wordmark } from "@/components/wordmark"
import { Button } from "@/components/ui/button"
import { getFilterOptions } from "@/lib/listings"

export async function SiteHeader() {
  const { categories } = await getFilterOptions()

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
          <Wordmark className="mr-auto md:mr-0" />

          <Suspense fallback={<div className="order-4 h-5 w-16" />}>
            <SessionStatus className="order-4" />
          </Suspense>

          <Button
            size="sm"
            className="order-3 md:order-3"
            render={<Link href="/post" />}
          >
            Post
          </Button>

          <LanguageToggle className="md:order-3" />

          <Suspense
            fallback={
              <div className="order-last h-10 w-full md:order-2 md:flex-1" />
            }
          >
            <SearchField className="order-last w-full md:order-2 md:w-auto md:max-w-2xl md:flex-1" />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<div className="h-[3.25rem] border-b border-border" />}>
        <CategoryRail categories={categories} />
      </Suspense>
    </>
  )
}

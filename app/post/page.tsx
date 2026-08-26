import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Eyebrow } from "@/components/kit"
import { PostFlow } from "@/components/post/post-flow"
import { getFilterOptions } from "@/lib/listings"
import { getMediaBaseUrl } from "@/lib/media"
import { getSessionUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Post a listing",
  description: "Snap a few photos and we'll fill in the details.",
}

/**
 * Selling, in three stops.
 *
 * The measure is narrower than the rest of the product on purpose: this is the
 * one page where the reader is producing rather than scanning, and a form at
 * 90rem is a form whose labels and inputs are a head-turn apart.
 *
 * Everything that varies by stage -- the step rail, the panels, the dock at the
 * bottom -- lives in PostFlow, because the stage is client state. This file is
 * the gate and the frame.
 */
export default async function PostPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/post")

  const { categories, conditions, areas } = await getFilterOptions()

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6 lg:pt-12">
      <header className="anim-rise max-w-xl">
        <Eyebrow>Sell</Eyebrow>
        <h1 className="type-section type-display mt-4 font-semibold text-foreground">
          Post an item
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Add photos and we&rsquo;ll read the details off them — title,
          category, condition, and what similar items go for. You can change
          anything before it goes up.
        </p>
      </header>

      <div className="mt-10">
        <PostFlow
          categories={categories}
          conditions={conditions}
          areas={areas.map((option) => option.area)}
          mediaBaseUrl={getMediaBaseUrl()}
        />
      </div>
    </main>
  )
}

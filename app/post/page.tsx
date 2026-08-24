import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PostFlow } from "@/components/post/post-flow"
import { getFilterOptions } from "@/lib/listings"
import { getMediaBaseUrl } from "@/lib/media"
import { getSessionUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Post a listing",
  description: "Snap a few photos and we'll fill in the details.",
}

export default async function PostPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/post")

  const { categories, conditions, areas } = await getFilterOptions()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="type-display text-2xl">Post a listing</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Add photos and we&rsquo;ll suggest the details. You can change anything.
      </p>

      <PostFlow
        categories={categories}
        conditions={conditions}
        areas={areas.map((option) => option.area)}
        mediaBaseUrl={getMediaBaseUrl()}
      />
    </main>
  )
}

"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconLoader2, IconSearch } from "@tabler/icons-react"

import { Input } from "@/components/ui/input"
import { resolveSearchRoute } from "@/lib/search-route"
import { cn } from "@/lib/utils"

/**
 * A search bar that understands sentences.
 *
 * A real GET form first — it works with JavaScript disabled and on the first
 * paint. With JavaScript, submitting sends the phrase to /api/search/parse and
 * routes to /browse with the filters it understood already applied, where they
 * appear as chips the shopper can correct by tapping.
 *
 * It fires on submit, not while typing. That is the difference between one API
 * call per search and one per typing pause: "ላፕቶፕ under 20000" is seventeen
 * keystrokes, and a debounce would send three to six requests, five of whose
 * answers get thrown away. Caching cannot fix that either, since every prefix
 * hashes to its own key. It also stops the page from re-rendering server-side
 * mid-word, which on Ethiopian mobile data felt worse than a button.
 *
 * The phrase-to-URL step lives in lib/search-route so the landing hero resolves
 * a sentence exactly the way this field does.
 */
export function SearchField({ className }: { className?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const initialQ = params.get("q") ?? ""
  const [pending, setPending] = React.useState(false)
  const requestIdRef = React.useRef(0)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(
      new FormData(event.currentTarget).get("q") ?? ""
    ).trim()

    const requestId = ++requestIdRef.current
    setPending(true)
    try {
      const href = await resolveSearchRoute(value)
      // A slower earlier search must not steer the page after a later one.
      if (requestId !== requestIdRef.current) return
      router.push(href)
    } finally {
      if (requestId === requestIdRef.current) setPending(false)
    }
  }

  return (
    <form
      action="/browse"
      method="get"
      role="search"
      onSubmit={handleSubmit}
      className={cn("relative min-w-0", className)}
    >
      {/* Preserve the active category so search narrows rather than resets. */}
      {params.get("category") ? (
        <input
          type="hidden"
          name="category"
          value={params.get("category") ?? ""}
        />
      ) : null}

      <label htmlFor="site-search" className="sr-only">
        Search listings
      </label>

      {/* A real submit button, not decoration: it gives a tap target to anyone
          who doesn't reach for the keyboard's Go key. */}
      <button
        type="submit"
        aria-label="Search"
        className="absolute top-1/2 left-1 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {pending ? (
          <IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <IconSearch aria-hidden="true" className="size-4" />
        )}
      </button>

      <Input
        key={initialQ}
        id="site-search"
        name="q"
        type="search"
        defaultValue={initialQ}
        placeholder="Search for phones, laptops, sofas, cars, tools..."
        autoComplete="off"
        className="h-10 rounded-lg border-border bg-card pr-3 pl-10 text-sm"
      />
    </form>
  )
}

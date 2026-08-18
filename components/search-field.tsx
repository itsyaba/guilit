"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconLoader2, IconSearch } from "@tabler/icons-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const DEBOUNCE_MS = 400

/**
 * A real GET form first — it works with JavaScript disabled and on the first
 * paint. With JavaScript, typing also debounces a call to /api/search/parse
 * (the natural-language -> filters endpoint) and routes client-side once it
 * settles, so a sentence query narrows results without a full page reload.
 * The endpoint's NL parsing itself is a separate ticket — today it mostly
 * echoes `q` back — but the wiring and the loading state are real.
 */
export function SearchField({ className }: { className?: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const initialQ = params.get("q") ?? ""
  const [pending, setPending] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = React.useRef(0)

  function handleChange(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current
      setPending(true)
      try {
        const res = await fetch("/api/search/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: next }),
        })
        if (!res.ok || requestId !== requestIdRef.current) return
        const { query } = (await res.json()) as { query: Record<string, unknown> }

        // The parsed query replaces filter state wholesale (a sentence like
        // "bag under 3000 birr" re-derives category + price, it doesn't just
        // add a keyword) — this is the documented contract in
        // app/api/search/parse/route.ts, even though today's stub mostly
        // returns q back unchanged.
        const search = new URLSearchParams()
        if (query.q) search.set("q", String(query.q))
        if (query.category) search.set("category", String(query.category))
        if (query.area) search.set("area", String(query.area))
        if (query.minPrice !== undefined) search.set("minPrice", String(query.minPrice))
        if (query.maxPrice !== undefined) search.set("maxPrice", String(query.maxPrice))
        if (query.sort) search.set("sort", String(query.sort))
        for (const value of (query.condition as string[] | undefined) ?? []) {
          search.append("condition", value)
        }
        for (const value of (query.tier as string[] | undefined) ?? []) {
          search.append("tier", value)
        }
        router.push(`/browse${search.toString() ? `?${search}` : ""}`)
      } finally {
        if (requestId === requestIdRef.current) setPending(false)
      }
    }, DEBOUNCE_MS)
  }

  return (
    <form
      action="/browse"
      method="get"
      role="search"
      className={cn("relative min-w-0", className)}
    >
      {/* Preserve the active category so search narrows rather than resets. */}
      {params.get("category") ? (
        <input type="hidden" name="category" value={params.get("category") ?? ""} />
      ) : null}

      <label htmlFor="site-search" className="sr-only">
        Search listings
      </label>

      {pending ? (
        <IconLoader2
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : (
        <IconSearch
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}

      <Input
        key={initialQ}
        id="site-search"
        name="q"
        type="search"
        defaultValue={initialQ}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Search for phones, laptops, sofas, cars, tools..."
        autoComplete="off"
        className="h-10 rounded-lg border-border bg-card pr-3 pl-9 text-sm"
      />
    </form>
  )
}

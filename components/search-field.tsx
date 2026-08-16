"use client"

import { useSearchParams } from "next/navigation"
import { IconSearch } from "@tabler/icons-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * A plain GET form. It works with JavaScript disabled and on the first paint,
 * which matters more here than an instant client-side filter would.
 *
 * Sentence queries ("bag under 3000 birr") are parsed into filters by the chat
 * ticket; this field submits whatever is typed and the browse page narrows on it.
 */
export function SearchField({ className }: { className?: string }) {
  const params = useSearchParams()

  return (
    <form
      action="/browse"
      method="get"
      role="search"
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
      <IconSearch
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="site-search"
        name="q"
        type="search"
        defaultValue={params.get("q") ?? ""}
        placeholder="Search for phones, laptops, sofas, cars, tools..."
        autoComplete="off"
        className="h-10 rounded-lg border-border bg-card pr-3 pl-9 text-sm"
      />
    </form>
  )
}

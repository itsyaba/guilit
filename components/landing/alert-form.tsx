"use client"

import * as React from "react"
import { IconLoader2 } from "@tabler/icons-react"

import { buttonVariants } from "@/components/ui/button"
import { resolveSearchRoute } from "@/lib/search-route"
import { cn } from "@/lib/utils"

type State = "idle" | "saving" | "saved" | "failed"

/**
 * One field, one button, no modal.
 *
 * The phrase goes through the same parser the search box uses, so "iPhone 12
 * under 30000" is stored as a real ListingQuery -- category, keyword, ceiling --
 * rather than as a string somebody has to match with LIKE later. That is what
 * makes the alert fire on an Amharic post about the same phone.
 *
 * `resolveSearchRoute` returns a browse URL rather than the query object, so the
 * search params are unpacked back into a query here. Reusing it keeps one
 * definition of what a phrase means; a second parser call path would drift.
 */
export function AlertForm({
  label,
  placeholder,
  action,
  saved,
  failed,
  className,
}: {
  label: string
  placeholder: string
  action: string
  saved: string
  failed: string
  className?: string
}) {
  const [state, setState] = React.useState<State>("idle")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const phrase = String(new FormData(event.currentTarget).get("q") ?? "").trim()
    if (!phrase) return

    setState("saving")
    try {
      const href = await resolveSearchRoute(phrase)
      const params = new URLSearchParams(href.split("?")[1] ?? "")
      const query: Record<string, unknown> = {}
      for (const key of ["q", "category", "area"]) {
        const value = params.get(key)
        if (value) query[key] = value
      }
      for (const key of ["minPrice", "maxPrice"]) {
        const value = params.get(key)
        if (value) query[key] = Number(value)
      }
      const conditions = params.getAll("condition")
      if (conditions.length) query.condition = conditions

      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, phrase }),
      })
      setState(res.ok ? "saved" : "failed")
    } catch {
      setState("failed")
    }
  }

  if (state === "saved") {
    return (
      <p
        role="status"
        className={cn("text-sm leading-relaxed text-foreground", className)}
      >
        {saved}
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className={cn("min-w-0", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-4xl border border-border bg-card p-2 pl-4",
          "transition-colors duration-500 ease-fluid focus-within:border-ring"
        )}
      >
        <label htmlFor="alert-query" className="sr-only">
          {label}
        </label>
        <input
          id="alert-query"
          name="q"
          type="search"
          required
          autoComplete="off"
          placeholder={placeholder}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={state === "saving"}
          className={buttonVariants({
            size: "lg",
            className: "h-10 shrink-0 rounded-4xl",
          })}
        >
          {state === "saving" ? (
            <IconLoader2
              aria-hidden="true"
              stroke={1.5}
              className="size-4 animate-spin"
            />
          ) : null}
          {action}
        </button>
      </div>

      {state === "failed" ? (
        <p role="status" className="mt-3 text-sm text-destructive">
          {failed}
        </p>
      ) : null}
    </form>
  )
}

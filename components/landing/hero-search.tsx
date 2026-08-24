"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconLoader2, IconSearch } from "@tabler/icons-react"

import { buttonVariants } from "@/components/ui/button"
import { resolveSearchRoute } from "@/lib/search-route"
import { cn } from "@/lib/utils"

/**
 * The front page's one control.
 *
 * A shopper who knows what they want types it; a shopper who does not taps one
 * of the phrases underneath. Both go through lib/search-route, so an example
 * and a typed sentence resolve identically, and both land on browse with the
 * filters already applied as chips you can correct.
 *
 * With JavaScript off this is a plain GET to /browse and keyword search still
 * works -- the `action` and `method` are real, not decoration. The JavaScript
 * upgrade is the sentence parser, and when /api/search/parse times out or 500s
 * `resolveSearchRoute` falls back to that same keyword query. There is no state
 * in which pressing Search does nothing.
 */
export function HeroSearch({
  examples,
  label,
  placeholder,
  action,
  className,
}: {
  examples: readonly string[]
  label: string
  placeholder: string
  action: string
  className?: string
}) {
  const router = useRouter()
  const formRef = React.useRef<HTMLFormElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)
  const requestIdRef = React.useRef(0)

  /**
   * Focus on load, on pointer devices only.
   *
   * Never the `autoFocus` attribute: on Android that raises the keyboard the
   * instant the page paints, which covers the listings directly below the field
   * and makes the first thing a shopper sees a keyboard rather than stock. The
   * media query is the whole point of doing it here instead.
   */
  React.useEffect(() => {
    if (!window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) {
      return
    }
    inputRef.current?.focus({ preventScroll: true })
  }, [])

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

  function runExample(phrase: string) {
    if (!inputRef.current || !formRef.current) return
    inputRef.current.value = phrase
    formRef.current.requestSubmit()
  }

  return (
    <div className={cn("min-w-0", className)}>
      <form
        ref={formRef}
        action="/browse"
        method="get"
        role="search"
        onSubmit={handleSubmit}
        className={cn(
          "group flex items-center gap-2 rounded-4xl border border-border bg-card p-2 pl-4",
          "shadow-[0_1px_2px_oklch(0_0_0/0.04)]",
          "transition-colors duration-500 ease-fluid focus-within:border-ring"
        )}
      >
        <IconSearch
          aria-hidden="true"
          stroke={1.5}
          className="size-5 shrink-0 text-muted-foreground transition-colors duration-500 ease-fluid group-focus-within:text-foreground"
        />

        <label htmlFor="hero-search" className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id="hero-search"
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          placeholder={placeholder}
          // h-12 keeps the field itself a 48px target, above the 44px floor,
          // without the row growing past 56px on a 390px screen.
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />

        <button
          type="submit"
          className={buttonVariants({
            size: "lg",
            className: "h-11 shrink-0 rounded-4xl",
          })}
        >
          {pending ? (
            <IconLoader2
              aria-hidden="true"
              stroke={1.5}
              className="size-4 animate-spin"
            />
          ) : null}
          {action}
        </button>
      </form>

      {/*
       * The examples are the feature explaining itself, and they stay in their
       * original scripts whichever language the interface is in -- that a
       * half-Amharic phrase resolves the same as an English one is the claim.
       */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {examples.map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => runExample(phrase)}
            className={cn(
              "rounded-4xl border border-border bg-card px-3 py-2 text-[0.8125rem] text-muted-foreground",
              "transition-colors duration-500 ease-fluid hover:border-foreground/25 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  )
}

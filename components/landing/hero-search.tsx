"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconArrowRight, IconLoader2, IconSearch } from "@tabler/icons-react"

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
 *
 * Two enclosures, not one: a recessed tray with the white field inside it. On a
 * near-white page a single bordered box is the shape of every form on the
 * internet, and this is the object the whole screen is built around -- the tray
 * is what gives it a machined edge, and it is also what the focus state lights
 * up, so the emphasis lands on the whole control rather than on a 1px line.
 */
export function HeroSearch({
  examples,
  label,
  placeholder,
  action,
  className,
  style,
}: {
  examples: readonly string[]
  label: string
  placeholder: string
  action: string
  className?: string
  style?: React.CSSProperties
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
    <div className={cn("min-w-0", className)} style={style}>
      <div
        className={cn(
          "group rounded-full bg-tray p-1.5 shadow-ambient ring-1 ring-hairline",
          "transition-shadow duration-700 ease-fluid focus-within:shadow-lift"
        )}
      >
        <form
          ref={formRef}
          action="/browse"
          method="get"
          role="search"
          onSubmit={handleSubmit}
          className={cn(
            "flex items-center gap-2 rounded-full bg-card py-1.5 pr-1.5 pl-4 ring-1 ring-hairline sm:pl-5",
            // Ring is a box-shadow in Tailwind v4, so one transition covers both.
            "transition-shadow duration-500 ease-fluid",
            "focus-within:ring-ring/45"
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

          {/*
           * The nested circle is the same pattern as the page's CTAs, and it is
           * the first thing to go at 640px: at 390px those 36px are the
           * difference between the placeholder reading "laptop in Bole under
           * 20000" and reading "laptop in Bol".
           */}
          <button
            type="submit"
            className={cn(
              "group/go flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary pr-4 pl-4 text-sm font-medium text-primary-foreground sm:pr-1.5",
              "transition-[transform,box-shadow] duration-500 ease-fluid active:scale-[0.985]",
              "shadow-hairline hover:shadow-ambient",
              "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            )}
          >
            {pending ? (
              <IconLoader2
                aria-hidden="true"
                stroke={1.5}
                className="size-4 animate-spin"
              />
            ) : null}
            {action}
            <span
              aria-hidden="true"
              className={cn(
                "hidden size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/18 sm:flex",
                "transition-transform duration-500 ease-fluid",
                "group-hover/go:translate-x-0.5 group-hover/go:scale-105"
              )}
            >
              <IconArrowRight stroke={1.5} className="size-4" />
            </span>
          </button>
        </form>
      </div>

      {/*
       * The examples are the feature explaining itself, and they stay in their
       * original scripts whichever language the interface is in -- that a
       * half-Amharic phrase resolves the same as an English one is the claim.
       */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {examples.map((phrase) => (
          <button
            key={phrase}
            type="button"
            onClick={() => runExample(phrase)}
            className={cn(
              "rounded-full bg-card px-3.5 py-2 text-[0.8125rem] text-muted-foreground shadow-hairline ring-1 ring-hairline",
              "transition-[transform,box-shadow,color] duration-500 ease-fluid",
              "hover:-translate-y-px hover:text-foreground hover:shadow-ambient active:translate-y-0",
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

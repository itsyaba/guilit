"use client"

import * as React from "react"
import { IconBrandTelegram, IconLoader2 } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * Bot deep-link login.
 *
 * The user taps one link, Telegram opens the bot, they press Start, and this
 * component — which has been asking the server every couple of seconds — gets a
 * session cookie back and navigates. No phone number, no oauth popup, no
 * service message that may or may not be delivered.
 *
 * Three details are doing the work:
 *
 *  - The token is minted on mount, so the visible control is a real `<a href>`
 *    the browser can follow on the first tap. Minting on click would mean an
 *    async round trip inside the click handler, and a `window.open` after an
 *    await is a popup blocker's textbook case.
 *  - Polling starts only once the link is actually opened. A tab left sitting
 *    on the login page costs nothing.
 *  - Coming back to the tab polls immediately. On a phone the tap leaves the
 *    browser entirely, so the return to it is the strongest possible hint that
 *    something has happened.
 */

type Phase = "loading" | "ready" | "waiting" | "authed" | "expired" | "error"

type PollResponse = {
  status: "pending" | "ready" | "expired"
  next?: string
  deepLink?: string | null
}

const POLL_INTERVAL_MS = 2000

export function TelegramDeepLinkLogin({ next }: { next: string | null }) {
  const [phase, setPhase] = React.useState<Phase>("loading")
  const [deepLink, setDeepLink] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  /** Bumped by the retry controls; the bootstrap effect below keys off it. */
  const [attempt, setAttempt] = React.useState(0)

  const finish = React.useCallback((destination: string) => {
    setPhase("authed")
    // A full navigation, not a router push: the session cookie was set on the
    // poll response, and every server component on the way to `destination`
    // has to be rendered again with it.
    window.location.assign(destination)
  }, [])

  const restart = React.useCallback(() => {
    setError(null)
    setPhase("loading")
    setAttempt((n) => n + 1)
  }, [])

  /**
   * Get a link to show. Runs on mount and on every retry.
   *
   * It polls before it mints. A user who tapped and then reloaded this page
   * still has a live token in their cookie, and burning it to issue a second
   * one would mean the tap they already made counts for nothing.
   */
  React.useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function bootstrap(): Promise<void> {
      try {
        const existing = await fetch("/api/auth/telegram/poll", {
          cache: "no-store",
          signal: controller.signal,
        })
        if (existing.ok) {
          const data = (await existing.json()) as PollResponse
          if (cancelled) return
          if (data.status === "ready") {
            finish(data.next || "/")
            return
          }
          if (data.status === "pending" && data.deepLink) {
            setDeepLink(data.deepLink)
            setPhase("ready")
            return
          }
        }
      } catch {
        // Fall through and mint a new token.
      }
      if (cancelled) return

      try {
        const response = await fetch("/api/auth/telegram/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next }),
          signal: controller.signal,
        })
        const data = (await response.json()) as {
          deepLink?: string
          error?: string
        }
        if (cancelled) return
        if (!response.ok || !data.deepLink) {
          setError(data.error ?? "Could not start a Telegram login.")
          setPhase("error")
          return
        }
        setDeepLink(data.deepLink)
        setPhase("ready")
      } catch {
        if (cancelled) return
        setError("Could not reach the server. Check your connection.")
        setPhase("error")
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [attempt, finish, next])

  /** The poll loop, alive only while waiting on a tap. */
  React.useEffect(() => {
    if (phase !== "waiting") return

    const controller = new AbortController()

    function poll(): void {
      fetch("/api/auth/telegram/poll", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: PollResponse | null) => {
          if (!data) return
          if (data.status === "ready") {
            finish(data.next || "/")
            return
          }
          if (data.status === "expired") {
            // Reachable only from this effect, so it is a token that died with
            // the user mid-tap rather than a stale cookie on a fresh visit.
            setPhase("expired")
          }
        })
        .catch(() => {
          // A dropped poll is not a failed login — the next tick tries again.
        })
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)

    return () => {
      clearInterval(timer)
      controller.abort()
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [phase, finish])

  if (phase === "error") {
    return (
      <div className="w-full">
        <p
          role="alert"
          className="rounded-tile bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-strong"
        >
          {error}
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    )
  }

  if (phase === "expired") {
    return (
      <div className="w-full">
        <p className="text-sm leading-relaxed text-muted-foreground">
          That sign-in link expired. Links are good for ten minutes.
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
        >
          Get a new link
        </button>
      </div>
    )
  }

  return (
    <div className="w-full">
      <a
        href={deepLink ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={phase === "loading"}
        onClick={(event) => {
          if (phase === "loading" || !deepLink) {
            event.preventDefault()
            return
          }
          setPhase("waiting")
        }}
        className={cn(
          "group/cta inline-flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-6 text-sm font-medium",
          "bg-primary text-primary-foreground shadow-ambient",
          "transition-[transform,background-color,box-shadow] duration-500 ease-fluid",
          "hover:shadow-lift active:scale-[0.985]",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
          phase === "loading" && "pointer-events-none opacity-60"
        )}
      >
        <span>
          {phase === "waiting"
            ? "Waiting for Telegram"
            : "Continue with Telegram"}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/18",
            "transition-transform duration-500 ease-fluid",
            "group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px group-hover/cta:scale-105"
          )}
        >
          {phase === "waiting" || phase === "authed" ? (
            <IconLoader2 stroke={1.5} className="size-4 animate-spin" />
          ) : (
            <IconBrandTelegram stroke={1.5} className="size-4" />
          )}
        </span>
      </a>

      {/*
        aria-live because on a phone the confirmation happens while the user is
        in another app entirely; the change they come back to is this sentence,
        and it is the only thing telling them the tap registered.
      */}
      <p
        aria-live="polite"
        className="mt-4 min-h-10 text-sm leading-relaxed text-muted-foreground"
      >
        {phase === "waiting" ? (
          <>
            Press <span className="text-foreground">Start</span> in the chat
            that just opened. This page unlocks by itself — you do not need to
            come back and click anything.{" "}
            <button
              type="button"
              onClick={restart}
              className="font-medium text-primary underline underline-offset-4"
            >
              Nothing opened?
            </button>
          </>
        ) : phase === "authed" ? (
          "Signed in. Taking you through…"
        ) : (
          "Opens a chat with our bot. One tap of Start and you are in — no phone number, no code to type."
        )}
      </p>
    </div>
  )
}

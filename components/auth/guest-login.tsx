"use client"

import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"
import { IconLoader2, IconUserBolt } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * The way in for someone who is not going to finish a Telegram login.
 *
 * The bot flow costs a context switch — leave the browser, find the chat,
 * press Start, come back — and anyone evaluating this app rather than using it
 * will abandon somewhere in the middle and read the dead end as a broken
 * product. So the offer is made up front, in a dialog, before the Telegram
 * button has had a chance to fail.
 *
 * The dialog opens once per browser session. Dismissing it leaves the inline
 * button below the Telegram control, so the escape hatch never disappears
 * entirely — it just stops interrupting.
 */

const SEEN_KEY = "gulit:guest-login-offered"

/**
 * Decided once per page load and cached, so the answer cannot change under a
 * re-render — the effect below writes the key the moment the dialog opens, and
 * a snapshot that re-read storage would flip to false and close it again.
 */
let offerDecision: boolean | null = null

function shouldOffer(): boolean {
  if (offerDecision !== null) return offerDecision
  try {
    offerDecision = window.sessionStorage.getItem(SEEN_KEY) !== "1"
  } catch {
    // Private mode, or storage disabled. Offering on every load beats never
    // offering, so treat an unreadable store as "not yet seen".
    offerDecision = true
  }
  return offerDecision
}

/** Nothing external ever changes this; the snapshot is fixed per page load. */
function subscribe(): () => void {
  return () => {}
}

type Props = {
  /** Where to land after signing in. Already validated on the server. */
  next: string | null
}

export function GuestLogin({ next }: Props) {
  const [dismissed, setDismissed] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * The server has no sessionStorage to read, so this starts false and settles
   * on the client value after hydration -- which is exactly what
   * useSyncExternalStore exists to do without a mismatch. A `useState` seeded
   * from storage would either read `window` during a server render or need a
   * setState in an effect, and the dialog would flash either way.
   */
  const offered = React.useSyncExternalStore(
    subscribe,
    shouldOffer,
    () => false
  )
  const open = offered && !dismissed

  /** Marking it seen is a write to an external system, so it lives here. */
  React.useEffect(() => {
    if (!open) return
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1")
    } catch {
      // Same unreadable store as above. The dialog is still dismissible.
    }
  }, [open])

  const signIn = React.useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      const response = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next }),
      })
      const data = (await response.json()) as { next?: string; error?: string }
      if (!response.ok) {
        setError(data.error ?? "Could not create a guest account.")
        setPending(false)
        return
      }
      // A full navigation, not a router push: the session cookie arrived on
      // this response and every server component on the way to the
      // destination has to render again with it.
      window.location.assign(data.next || "/")
    } catch {
      setError("Could not reach the server. Check your connection.")
      setPending(false)
    }
  }, [next])

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(isOpen) => setDismissed(!isOpen)}>
        <Dialog.Portal>
          <Dialog.Backdrop
            className={cn(
              "fixed inset-0 z-50 min-h-dvh bg-foreground/25 transition-opacity duration-500 ease-fluid",
              "data-ending-style:opacity-0 data-starting-style:opacity-0",
              "supports-backdrop-filter:backdrop-blur-sm",
              // iOS Safari: `fixed` inside the visual viewport leaves a strip
              // of unshaded page above the address bar.
              "supports-[-webkit-touch-callout:none]:absolute"
            )}
          />
          <Dialog.Popup
            className={cn(
              "fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2",
              "rounded-shell bg-tray p-2 ring-1 ring-hairline",
              "transition-[opacity,transform] duration-500 ease-fluid",
              "data-ending-style:scale-[0.98] data-ending-style:opacity-0",
              "data-starting-style:scale-[0.98] data-starting-style:opacity-0",
              "outline-none"
            )}
          >
            <div className="rounded-panel bg-card p-6 shadow-ambient ring-1 ring-hairline sm:p-8">
              <span
                aria-hidden="true"
                className="flex size-11 items-center justify-center rounded-full bg-primary/10 ring-1 ring-hairline"
              >
                <IconUserBolt stroke={1.5} className="size-5 text-primary" />
              </span>

              <Dialog.Title className="type-display mt-5 text-lg font-semibold text-foreground">
                Telegram login takes a detour
              </Dialog.Title>

              <Dialog.Description className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Signing in for real means leaving this tab, opening our bot in
                Telegram and pressing Start. It works, but it needs a Telegram
                account and a few taps on another app.
                <span className="mt-3 block">
                  If you are here to look around, take a guest account instead.
                  It is a real account — post a listing, message a seller,
                  reserve an item — it just skips Telegram.
                </span>
              </Dialog.Description>

              {error ? (
                <p
                  role="alert"
                  className="mt-5 rounded-tile bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-strong"
                >
                  {error}
                </p>
              ) : null}

              <div className="mt-7 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={signIn}
                  disabled={pending}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium",
                    "bg-primary text-primary-foreground shadow-ambient",
                    "transition-[transform,box-shadow] duration-500 ease-fluid",
                    "hover:shadow-lift active:scale-[0.985]",
                    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
                    "disabled:pointer-events-none disabled:opacity-60"
                  )}
                >
                  {pending ? (
                    <IconLoader2 stroke={1.5} className="size-4 animate-spin" />
                  ) : null}
                  {pending ? "Creating your account…" : "Continue as guest"}
                </button>

                <Dialog.Close
                  className={cn(
                    "inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium",
                    "text-muted-foreground transition-colors duration-500 ease-fluid hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
                  )}
                >
                  I have Telegram, log me in properly
                </Dialog.Close>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* The same offer, kept in the page after the dialog is dismissed. */}
      <div className="mt-8 border-t border-hairline pt-6">
        <button
          type="button"
          onClick={signIn}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-2 text-sm font-medium text-primary",
            "underline underline-offset-4 transition-opacity duration-500 ease-fluid",
            "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
            "disabled:pointer-events-none disabled:opacity-60"
          )}
        >
          {pending ? (
            <IconLoader2 stroke={1.5} className="size-4 animate-spin" />
          ) : (
            <IconUserBolt stroke={1.5} className="size-4" />
          )}
          {pending ? "Creating your account…" : "Continue as a guest instead"}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          No Telegram needed. Creates a throwaway account so you can post,
          message and reserve straight away.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-tile bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive-strong"
          >
            {error}
          </p>
        ) : null}
      </div>
    </>
  )
}

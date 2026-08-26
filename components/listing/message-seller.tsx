"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconMessageCircle, IconSend } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const MAX_CHARS = 2000

/**
 * The one contact route a native listing has.
 *
 * A listing posted here has no Telegram channel behind it to link to, so this
 * is not a nicety — without it the page has no working way to reach the seller
 * at all. For a claimed listing it sits *below* the Telegram button instead,
 * because that seller is demonstrably reachable where they already are and the
 * inbox they check hourly beats the one they signed up for yesterday.
 *
 * Opens closed. The button is the same 56px pill as the other contact routes,
 * and the composer only appears once someone has decided to write — a textarea
 * sitting open on a listing page is a form nobody asked for taking up the space
 * where the price should be.
 */
export function MessageSeller({
  listingId,
  isLoggedIn,
  conversationId,
  tone = "solid",
}: {
  listingId: string
  isLoggedIn: boolean
  /** An existing thread, if this buyer has already written. */
  conversationId: string | null
  tone?: "solid" | "quiet"
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [body, setBody] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const textarea = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (open) textarea.current?.focus()
  }, [open])

  /**
   * An existing thread is a link, not a form. The messages already in it are
   * the context for whatever comes next, and sending blind from here would be
   * writing into a conversation you cannot see.
   */
  if (conversationId && !sentTo) {
    return (
      <ThreadLink
        href={`/messages/${conversationId}`}
        tone={tone}
        label="Open your conversation"
      />
    )
  }

  if (sentTo) {
    return (
      <div className="space-y-3">
        <ThreadLink
          href={`/messages/${sentTo}`}
          tone="solid"
          label="Open your conversation"
        />
        <p className="rounded-tile bg-tray px-4 py-3 text-sm leading-relaxed text-muted-foreground ring-1 ring-hairline">
          Sent. The seller gets a Telegram notification if they have our bot
          open, and your thread is in Messages either way.
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={pillClasses(tone)}
      >
        <span aria-hidden="true" className={badgeClasses(tone)}>
          <IconMessageCircle stroke={1.5} className="size-5" />
        </span>
        Message the seller
      </button>
    )
  }

  async function send() {
    const trimmed = body.trim()
    if (!trimmed) return

    setPending(true)
    setError(null)

    const res = await fetch(`/api/listings/${listingId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    })

    setPending(false)

    if (res.ok) {
      const data = await res.json()
      setSentTo(data.conversationId as string)
      setBody("")
      // The seller block above shows a message count; refresh picks it up.
      router.refresh()
      return
    }

    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not send that. Try again shortly.")
  }

  return (
    <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
      <div className="space-y-3 rounded-panel bg-card p-4 ring-1 ring-hairline">
        {isLoggedIn ? null : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Link
              href="/login"
              className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
            >
              Log in with Telegram
            </Link>{" "}
            to send this — it takes one tap and the seller sees who they are
            talking to.
          </p>
        )}

        <label htmlFor="message-body" className="sr-only">
          Your message to the seller
        </label>
        <textarea
          id="message-body"
          ref={textarea}
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line. Phone keyboards send a
            // plain Enter, which is the common case here.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (isLoggedIn) void send()
            }
          }}
          rows={3}
          disabled={!isLoggedIn}
          placeholder="Is it still available? Can I see it this weekend?"
          className={cn(
            "w-full resize-y rounded-tile bg-tray px-4 py-3 text-base text-foreground",
            "ring-1 ring-hairline placeholder:text-muted-foreground/70",
            "transition-shadow duration-500 ease-fluid",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            "disabled:opacity-60"
          )}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="type-ledger text-muted-foreground">
            {body.length > MAX_CHARS - 200
              ? `${MAX_CHARS - body.length} characters left`
              : "Never send money before seeing the item."}
          </p>
          <Button
            type="button"
            onClick={() => void send()}
            disabled={pending || !body.trim() || !isLoggedIn}
            className="h-10 shrink-0 rounded-full px-5"
          >
            <IconSend stroke={1.5} className="size-4" />
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}

function ThreadLink({
  href,
  label,
  tone,
}: {
  href: string
  label: string
  tone: "solid" | "quiet"
}) {
  return (
    <Link href={href} className={pillClasses(tone)}>
      <span aria-hidden="true" className={badgeClasses(tone)}>
        <IconMessageCircle stroke={1.5} className="size-5" />
      </span>
      {label}
    </Link>
  )
}

/**
 * Same geometry as ContactPanel's routes, deliberately. These sit in one stack
 * with the Telegram and phone buttons and any difference in height or radius
 * would read as a different kind of control.
 */
function pillClasses(tone: "solid" | "quiet"): string {
  return cn(
    "group/act flex h-14 w-full items-center gap-3 rounded-full pr-6 pl-2 text-base font-medium",
    "transition-[transform,box-shadow] duration-500 ease-fluid active:scale-[0.99]",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
    tone === "solid"
      ? "bg-primary text-primary-foreground shadow-ambient hover:shadow-lift"
      : "bg-card text-foreground shadow-hairline ring-1 ring-hairline hover:shadow-ambient"
  )
}

function badgeClasses(tone: "solid" | "quiet"): string {
  return cn(
    "flex size-10 shrink-0 items-center justify-center rounded-full",
    "transition-transform duration-500 ease-fluid group-hover/act:scale-105",
    tone === "solid" ? "bg-primary-foreground/18" : "bg-tray"
  )
}

"use client"

import * as React from "react"
import { IconCheck, IconReceipt, IconSend } from "@tabler/icons-react"

import { startCheckout } from "@/components/messages/checkout"
import { Button } from "@/components/ui/button"
import { formatAmount } from "@/lib/format"
import type { ThreadMessage } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_CHARS = 2000

/** Slow enough to be free on a metered connection, fast enough to feel live. */
const POLL_MS = 6000

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Africa/Addis_Ababa",
})

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "Africa/Addis_Ababa",
})

/**
 * One conversation.
 *
 * Polled, not socketed. Two people agreeing on a time to look at a fridge do
 * not need sub-second delivery, and a WebSocket would put a stateful process in
 * a deployment whose entire pitch is that it is three containers on any VPS.
 * The poll sends the timestamp of the newest message it holds, so the steady
 * state is an empty 200 rather than the thread again.
 *
 * Polling stops while the tab is hidden. On Ethiopian mobile data a background
 * tab quietly spending a request every six seconds is a real cost to a real
 * person, and the `visibilitychange` listener is four lines.
 */
export function ThreadView({
  conversationId,
  initialMessages,
}: {
  conversationId: string
  initialMessages: ThreadMessage[]
}) {
  const [messages, setMessages] = React.useState(initialMessages)
  const [body, setBody] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const bottom = React.useRef<HTMLDivElement>(null)
  const latestAt = messages.length
    ? messages[messages.length - 1].createdAt
    : null

  /**
   * Merge by id — a poll can overlap with an optimistic send of the same message.
   *
   * Existing rows are *replaced*, not skipped, because a payment request's state
   * is not fixed: one that was payable a minute ago stops being payable the
   * moment somebody's hold lands, and the poll re-sends every request in the
   * thread precisely so this can update. Skipping known ids would leave a live
   * Pay button on a request that now 409s.
   */
  const merge = React.useCallback((incoming: ThreadMessage[]) => {
    if (incoming.length === 0) return
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]))
      let changed = false
      for (const message of incoming) {
        const existing = byId.get(message.id)
        if (!existing) {
          changed = true
        } else if (
          existing.request?.status !== message.request?.status ||
          existing.request?.canPay !== message.request?.canPay
        ) {
          changed = true
        } else {
          continue
        }
        byId.set(message.id, message)
      }
      if (!changed) return current
      return [...byId.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      )
    })
  }, [])

  React.useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      if (cancelled || document.visibilityState !== "visible") {
        schedule()
        return
      }
      try {
        const url = new URL(
          `/api/conversations/${conversationId}/messages`,
          window.location.origin
        )
        if (latestAt) url.searchParams.set("since", latestAt)

        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          merge(data.messages as ThreadMessage[])
        }
      } catch {
        // A failed poll is a poll. The next one is six seconds away and the
        // thread on screen is still the thread.
      }
      schedule()
    }

    function schedule() {
      if (!cancelled) timer = setTimeout(poll, POLL_MS)
    }

    schedule()

    // Coming back to the tab should show the backlog immediately, not in six
    // seconds' time.
    function onVisible() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer)
        void poll()
      }
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [conversationId, latestAt, merge])

  // Only follow the tail when a message arrives, never on first paint — the
  // page's own heading should be what you land on.
  const count = messages.length
  const mounted = React.useRef(false)
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [count])

  async function send() {
    const trimmed = body.trim()
    if (!trimmed) return

    setPending(true)
    setError(null)

    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    })

    setPending(false)

    if (res.ok) {
      const data = await res.json()
      merge([data.message as ThreadMessage])
      setBody("")
      return
    }

    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not send that. Try again shortly.")
  }

  return (
    <div className="space-y-4">
      <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <ol
          aria-live="polite"
          aria-label="Messages"
          className="max-h-[60vh] min-h-56 space-y-3 overflow-y-auto rounded-panel bg-card p-4 ring-1 ring-hairline sm:p-5"
        >
          {messages.map((message, index) => (
            <React.Fragment key={message.id}>
              {needsDayBreak(messages, index) ? (
                <li className="flex justify-center py-1">
                  <span className="type-ledger rounded-full bg-tray px-3 py-1 text-muted-foreground">
                    {dayFormat.format(new Date(message.createdAt))}
                  </span>
                </li>
              ) : null}
              <Bubble message={message} conversationId={conversationId} />
            </React.Fragment>
          ))}
          <div ref={bottom} />
        </ol>
      </div>

      <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div className="space-y-3 rounded-panel bg-card p-4 ring-1 ring-hairline">
          <label htmlFor="reply-body" className="sr-only">
            Your reply
          </label>
          <textarea
            id="reply-body"
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder="Write a reply…"
            className={cn(
              "w-full resize-y rounded-tile bg-tray px-4 py-3 text-base text-foreground",
              "ring-1 ring-hairline placeholder:text-muted-foreground/70",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            )}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="type-ledger text-muted-foreground">
              Meet in a public place. Never pay in advance for something you have
              not seen.
            </p>
            <Button
              type="button"
              onClick={() => void send()}
              disabled={pending || !body.trim()}
              className="h-10 shrink-0 rounded-full px-5"
            >
              <IconSend stroke={1.5} className="size-4" />
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}

function needsDayBreak(messages: ThreadMessage[], index: number): boolean {
  if (index === 0) return true
  const previous = new Date(messages[index - 1].createdAt).toDateString()
  const current = new Date(messages[index].createdAt).toDateString()
  return previous !== current
}

/**
 * Mine right, theirs left, the platform's own notes centred and quiet.
 *
 * A system message is not a party to the conversation and must not look like
 * one — a "deposit received" line styled as the seller's own words is us
 * putting a claim about money in someone else's mouth.
 */
function Bubble({
  message,
  conversationId,
}: {
  message: ThreadMessage
  conversationId: string
}) {
  if (message.kind === "payment_request") {
    return (
      <PaymentRequestCard message={message} conversationId={conversationId} />
    )
  }

  if (message.author === "system") {
    return (
      <li className="flex justify-center">
        <p className="max-w-[85%] rounded-tile bg-tray px-4 py-2.5 text-center text-sm leading-relaxed text-muted-foreground ring-1 ring-hairline">
          {message.body}
        </p>
      </li>
    )
  }

  const mine = message.author === "me"

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-panel px-4 py-2.5 sm:max-w-[75%]",
          mine
            ? "bg-primary text-primary-foreground"
            : "bg-tray text-foreground ring-1 ring-hairline"
        )}
      >
        <p lang="am" className="text-sm leading-relaxed whitespace-pre-line">
          {message.body}
        </p>
        <p
          className={cn(
            "type-ledger mt-1 tabular-nums",
            mine ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {timeFormat.format(new Date(message.createdAt))}
        </p>
      </div>
    </li>
  )
}

/**
 * A seller's request for a figure, rendered as something you can act on.
 *
 * Deliberately not a chat bubble. A bubble is somebody talking; this is an
 * object with a state and a button, and dressing it as speech is how a buyer
 * scrolls past the one message in the thread that was asking them to do
 * something. It sits centred and full width for the same reason.
 *
 * The button appears only when the server said this exact request is payable —
 * see PaymentRequestState. Everything else renders as a status line, including
 * the seller's view of their own request, which is a thing they sent rather than
 * a thing they can pay.
 */
function PaymentRequestCard({
  message,
  conversationId,
}: {
  message: ThreadMessage
  conversationId: string
}) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const request = message.request
  if (!request) return null

  async function pay() {
    setPending(true)
    setError(null)
    const failure = await startCheckout(conversationId, message.id)
    if (failure) {
      setPending(false)
      setError(failure)
    }
  }

  const paid = request.status === "paid"

  return (
    <li className="flex justify-center">
      <div
        className={cn(
          "w-full max-w-md rounded-panel p-4 ring-1",
          paid
            ? "bg-primary/8 ring-primary/20"
            : request.status === "stale"
              ? "bg-tray ring-hairline"
              : "bg-card shadow-hairline ring-hairline"
        )}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground"
          >
            {paid ? (
              <IconCheck stroke={1.5} className="size-4" />
            ) : (
              <IconReceipt stroke={1.5} className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="type-ledger type-mixed text-muted-foreground">
              {message.author === "me" ? "You requested" : "Deposit requested"}
            </p>
            <p className="type-display text-base font-semibold text-foreground tabular-nums">
              {formatAmount(request.amountEtb)} ETB
            </p>
          </div>
          <span className="type-ledger ml-auto shrink-0 text-muted-foreground tabular-nums">
            {timeFormat.format(new Date(message.createdAt))}
          </span>
        </div>

        {/* The seller's own words, when they added any. The default body is a
            restatement of the figure above it, so it is not repeated here. */}
        {message.body && !message.body.startsWith("Deposit request:") ? (
          <p
            lang="am"
            className="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground"
          >
            {message.body}
          </p>
        ) : null}

        {request.canPay ? (
          <Button
            type="button"
            onClick={() => void pay()}
            disabled={pending}
            className="mt-3 h-10 w-full rounded-full"
          >
            {pending
              ? "Opening checkout…"
              : `Pay ${formatAmount(request.amountEtb)} ETB`}
          </Button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{request.note}</p>
        )}

        {request.canPay ? (
          <p className="type-ledger mt-2 text-muted-foreground">
            Holds the item for you. The balance is paid in person.
          </p>
        ) : null}

        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </li>
  )
}

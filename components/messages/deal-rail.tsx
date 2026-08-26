"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconLock,
  IconReceipt,
  IconShieldCheck,
} from "@tabler/icons-react"

import { startCheckout } from "@/components/messages/checkout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatAmount, formatDeadline } from "@/lib/format"
import type { ConversationRole, ReservationView } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The deal rail: paying and asking to be paid, without leaving the thread.
 *
 * A used-goods conversation is a negotiation, and the moment it closes is a
 * sentence in the middle of it — "ok, 45,000 and I'll come Saturday". Sending
 * that person back to the listing page to act on it is where the deal goes cold.
 * So both sides of the transaction live here: the buyer can put a deposit down
 * at the listing's own figure, and the seller can ask for the number they just
 * agreed to instead.
 *
 * Asymmetric on purpose. The seller asks and confirms handover; the buyer pays
 * and can release. Neither sees the other's controls, because a "Handed over"
 * button in front of a buyer is an invitation to release a hold they are still
 * relying on.
 */
export function DealRail({
  conversationId,
  role,
  depositEtb,
  holdHours,
  priceEtb,
  reservation,
  outcome,
  testMode,
}: {
  conversationId: string
  role: ConversationRole
  /** Computed deposit for the item. Null when the listing carries no price. */
  depositEtb: number | null
  holdHours: number
  priceEtb: number | null
  reservation: ReservationView | null
  /** Set by the redirect back from Chapa. */
  outcome: "paid" | "failed" | "unknown" | null
  testMode: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function pay() {
    setPending(true)
    setError(null)
    const failure = await startCheckout(conversationId)
    if (failure) {
      setPending(false)
      setError(failure)
    }
  }

  async function close(next: "completed" | "cancelled") {
    if (!reservation) return
    setPending(true)
    setError(null)

    const res = await fetch(`/api/reservations/${reservation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: next }),
    })
    setPending(false)

    if (res.ok) {
      router.refresh()
      return
    }
    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not update the hold.")
  }

  const notice =
    outcome === "failed" ? (
      <Notice>
        That payment did not go through. Nothing is held and nothing was charged.
      </Notice>
    ) : outcome === "unknown" ? (
      <Notice>
        We could not confirm that payment yet. If it went through, the hold shows
        here within a few minutes — do not pay twice.
      </Notice>
    ) : null

  // ---- a deposit is down ------------------------------------------------
  if (reservation?.status === "paid") {
    return (
      <Frame tone="held" icon={<IconLock stroke={1.5} className="size-4" />} label="On hold">
        {notice}
        <p className="text-sm leading-relaxed text-foreground">
          {role === "buyer" ? (
            <>
              Your {formatAmount(reservation.amountEtb)} ETB deposit is holding
              this until {formatDeadline(reservation.expiresAt)}. Bring the
              balance — the deposit comes off the price.
            </>
          ) : (
            <>
              {reservation.counterpart ? `@${reservation.counterpart}` : "The buyer"}{" "}
              has {formatAmount(reservation.amountEtb)} ETB down, holding this
              until {formatDeadline(reservation.expiresAt)}. Keep it aside until
              then.
            </>
          )}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {role === "seller" ? (
            <>
              <Button
                type="button"
                onClick={() => void close("completed")}
                disabled={pending}
                className="h-9 rounded-full px-4"
              >
                <IconCheck stroke={1.5} className="size-4" />
                Handed over
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void close("cancelled")}
                disabled={pending}
                className="h-9 rounded-full border-0 bg-card px-4 ring-1 ring-hairline"
              >
                Cancel the hold
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => void close("cancelled")}
              disabled={pending}
              className="h-9 rounded-full border-0 bg-card px-4 ring-1 ring-hairline"
            >
              Release the hold
            </Button>
          )}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Frame>
    )
  }

  // ---- a checkout is open but unpaid ------------------------------------
  if (reservation?.status === "pending") {
    return (
      <Frame
        tone="quiet"
        icon={<IconClock stroke={1.5} className="size-4" />}
        label="Being reserved"
      >
        {notice}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {reservation.checkoutUrl
            ? "Your checkout is still open. Finish it to hold the item — nothing has been charged yet."
            : "A checkout is open on this item right now. If it is not finished, it opens up again shortly."}
        </p>
        {reservation.checkoutUrl ? (
          <a
            href={reservation.checkoutUrl}
            className="type-ledger inline-flex items-center gap-1.5 text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
          >
            Finish the checkout
          </a>
        ) : null}
      </Frame>
    )
  }

  // ---- seller: ask for a figure -----------------------------------------
  if (role === "seller") {
    return (
      <RequestComposer
        conversationId={conversationId}
        suggestedEtb={depositEtb}
        priceEtb={priceEtb}
        notice={notice}
      />
    )
  }

  // ---- buyer: pay the listing's own deposit ------------------------------
  if (depositEtb === null) return notice ? <Frame tone="quiet" icon={null} label="Payment">{notice}</Frame> : null

  return (
    <Frame
      tone="quiet"
      icon={<IconShieldCheck stroke={1.5} className="size-4" />}
      label="Hold this item"
    >
      {notice}
      <p className="text-sm leading-relaxed text-muted-foreground">
        A {formatAmount(depositEtb)} ETB deposit through Chapa takes it off the
        market for {holdHours} hours while you arrange to collect. You pay the
        rest in person, and the deposit comes off the price.
      </p>
      <Button
        type="button"
        onClick={() => void pay()}
        disabled={pending}
        className="h-11 w-full rounded-full"
      >
        {pending ? "Opening checkout…" : `Pay ${formatAmount(depositEtb)} ETB deposit`}
      </Button>
      {testMode ? (
        <p className="type-ledger text-muted-foreground">
          Test mode — no Chapa key is configured, so no money moves.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Frame>
  )
}

/**
 * The seller's side: name a figure and send it into the thread.
 *
 * Prefilled with the listing's computed deposit because that is the right answer
 * most of the time and typing on a phone is the friction here — but it is an
 * editable field, since the entire reason this exists is that the agreed number
 * is often not the listed one.
 */
function RequestComposer({
  conversationId,
  suggestedEtb,
  priceEtb,
  notice,
}: {
  conversationId: string
  suggestedEtb: number | null
  priceEtb: number | null
  notice: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [amount, setAmount] = React.useState(
    suggestedEtb !== null ? String(suggestedEtb) : ""
  )
  const [note, setNote] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function send() {
    const value = Number(amount)
    if (!Number.isInteger(value) || value < 1) {
      setError("Enter a whole number of birr.")
      return
    }

    setPending(true)
    setError(null)

    const res = await fetch(
      `/api/conversations/${conversationId}/payment-request`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEtb: value, note: note.trim() || null }),
      }
    )
    setPending(false)

    if (res.ok) {
      setOpen(false)
      setNote("")
      // The request has to appear in the thread, and the thread is server-rendered
      // on first paint — the poll would get there eventually, a refresh is now.
      router.refresh()
      return
    }
    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not send that request.")
  }

  return (
    <Frame
      tone="quiet"
      icon={<IconReceipt stroke={1.5} className="size-4" />}
      label="Ask for a deposit"
    >
      {notice}

      {open ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label htmlFor="request-amount" className="sr-only">
              Deposit amount in birr
            </label>
            <Input
              id="request-amount"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d]/g, "").slice(0, 7))
              }
              inputMode="numeric"
              placeholder="Amount"
              className="h-10 w-32 rounded-full border-0 bg-tray px-4 tabular-nums ring-1 ring-hairline"
            />
            <span className="type-ledger text-muted-foreground">ETB</span>
          </div>

          <label htmlFor="request-note" className="sr-only">
            A line for the buyer
          </label>
          <Input
            id="request-note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 160))}
            placeholder="Optional — what this covers"
            className="h-10 w-full rounded-full border-0 bg-tray px-4 ring-1 ring-hairline"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void send()}
              disabled={pending || !amount}
              className="h-10 rounded-full px-5"
            >
              {pending ? "Sending…" : "Send request"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              disabled={pending}
              className="h-10 rounded-full border-0 bg-card px-4 ring-1 ring-hairline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Send the buyer a figure to pay through Chapa. It holds the item for
            them and shows you they are serious — you still collect the balance
            in person.
            {priceEtb !== null
              ? ` The asking price is ${formatAmount(priceEtb)} ETB.`
              : ""}
          </p>
          <Button
            type="button"
            onClick={() => setOpen(true)}
            variant="outline"
            className="h-10 rounded-full border-0 bg-card px-4 ring-1 ring-hairline"
          >
            Request a deposit
          </Button>
        </>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Frame>
  )
}

/** The tray-and-core enclosure the thread's other blocks use, with a state chip. */
function Frame({
  tone,
  icon,
  label,
  children,
}: {
  tone: "held" | "quiet"
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-shell p-2 ring-1 ring-hairline",
        tone === "held" ? "bg-primary/8" : "bg-tray"
      )}
    >
      <div className="space-y-3 rounded-panel bg-card p-5 ring-1 ring-hairline">
        <span className="type-ledger type-mixed inline-flex items-center gap-2 rounded-full bg-tray px-3 py-1.5 text-muted-foreground">
          {icon ? (
            <span aria-hidden="true" className="shrink-0">
              {icon}
            </span>
          ) : null}
          {label}
        </span>
        {children}
      </div>
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-tile bg-destructive/8 px-4 py-3 text-sm leading-relaxed text-destructive-strong ring-1 ring-destructive/20">
      <IconAlertTriangle
        aria-hidden="true"
        stroke={1.5}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{children}</span>
    </p>
  )
}

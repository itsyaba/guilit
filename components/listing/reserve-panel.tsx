"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconLock,
  IconShieldCheck,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { formatAmount, formatDeadline } from "@/lib/format"
import type { ReservationView } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The Chapa hold.
 *
 * Everything about this panel is written to avoid implying a purchase, because
 * it is not one and a buyer who thinks it is will turn up expecting delivery.
 * The word is "hold" throughout, the deposit figure is always next to what it
 * buys, and the fact that the item is still handed over in person is stated on
 * the panel rather than buried in a terms page nobody opens.
 *
 * Four audiences, one component: a stranger sees only that the item is taken; a
 * buyer sees their own deadline; the seller sees that money is down and can
 * close the hold out; the logged-out visitor sees what it would cost. Each of
 * those is a different sentence, and getting them wrong is worse than not
 * shipping the feature — "you are holding this item" shown to the wrong person
 * is a lie about who has a claim on it.
 */
export function ReservePanel({
  listingId,
  depositEtb,
  holdHours,
  isLoggedIn,
  isOwnListing,
  reservation,
  conversationId,
  testMode,
  outcome,
}: {
  listingId: string
  /** Null when the listing has no price — nothing to take a percentage of. */
  depositEtb: number | null
  holdHours: number
  isLoggedIn: boolean
  isOwnListing: boolean
  reservation: ReservationView | null
  conversationId: string | null
  /** No Chapa key configured — say so rather than implying money moved. */
  testMode: boolean
  /** Set by the redirect back from Chapa. */
  outcome: "paid" | "failed" | "unknown" | null
}) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reserve() {
    setPending(true)
    setError(null)

    const res = await fetch(`/api/listings/${listingId}/reserve`, {
      method: "POST",
    })

    if (res.ok) {
      const data = await res.json()
      // Chapa's hosted page, or — with no key configured — our own settle route,
      // which is what makes this demonstrable offline. Either way it is a full
      // navigation: a payment page does not belong in a fetch.
      window.location.assign(data.checkoutUrl as string)
      return
    }

    setPending(false)
    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not open the checkout. Nothing was charged.")
  }

  async function close(nextOutcome: "completed" | "cancelled") {
    if (!reservation) return
    setPending(true)
    setError(null)

    const res = await fetch(`/api/reservations/${reservation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: nextOutcome }),
    })

    setPending(false)
    if (res.ok) {
      router.refresh()
      return
    }
    const payload = await res.json().catch(() => ({}))
    setError(payload.error ?? "Could not update the hold.")
  }

  // ---- a hold is live ----------------------------------------------------
  if (reservation && reservation.status === "paid") {
    return (
      <HoldFrame
        tone={reservation.viewer === "other" ? "neutral" : "held"}
        icon={<IconLock stroke={1.5} className="size-4" />}
        label={reservation.viewer === "other" ? "Reserved" : "On hold"}
      >
        <p className="text-sm leading-relaxed text-foreground">
          {reservation.viewer === "buyer" ? (
            <>
              You are holding this item with a{" "}
              <strong className="font-semibold">
                {formatAmount(reservation.amountEtb)} ETB
              </strong>{" "}
              deposit. The seller has agreed to keep it for you until{" "}
              {formatDeadline(reservation.expiresAt)}. Bring the balance —
              the deposit counts toward the price.
            </>
          ) : reservation.viewer === "seller" ? (
            <>
              {reservation.counterpart ? `@${reservation.counterpart}` : "A buyer"}{" "}
              has put down{" "}
              <strong className="font-semibold">
                {formatAmount(reservation.amountEtb)} ETB
              </strong>{" "}
              to hold this until {formatDeadline(reservation.expiresAt)}. Keep it
              aside for them until then.
            </>
          ) : (
            <>
              A buyer has a deposit on this item until{" "}
              {formatDeadline(reservation.expiresAt)}. If they do not collect it,
              the hold lapses and the item is available again.
            </>
          )}
        </p>

        {reservation.viewer !== "other" && conversationId ? (
          <Link
            href={`/messages/${conversationId}`}
            className="type-ledger inline-flex items-center gap-1.5 text-foreground underline decoration-hairline underline-offset-4 transition-colors duration-500 ease-fluid hover:text-primary"
          >
            Arrange the handover in Messages
          </Link>
        ) : null}

        {reservation.viewer === "seller" ? (
          <div className="flex flex-wrap gap-2 pt-1">
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
          </div>
        ) : null}

        {reservation.viewer === "buyer" ? (
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => void close("cancelled")}
              disabled={pending}
              className="h-9 rounded-full border-0 bg-card px-4 ring-1 ring-hairline"
            >
              Release the hold
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </HoldFrame>
    )
  }

  // ---- a checkout is open but unpaid ------------------------------------
  if (reservation && reservation.status === "pending") {
    return (
      <HoldFrame
        tone="neutral"
        icon={<IconClock stroke={1.5} className="size-4" />}
        label="Being reserved"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {reservation.checkoutUrl
            ? "Your checkout is still open. Finish it to hold the item — nothing has been charged yet."
            : "Someone is at the checkout for this item right now. If they do not finish, it opens up again shortly."}
        </p>
        {reservation.checkoutUrl ? (
          <a
            href={reservation.checkoutUrl}
            className="type-ledger inline-flex items-center gap-1.5 text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
          >
            Finish the checkout
          </a>
        ) : null}
      </HoldFrame>
    )
  }

  // ---- nothing to show -------------------------------------------------
  // No price means no deposit to compute, and the seller does not need a
  // button to pay themselves.
  if (depositEtb === null || isOwnListing) return null

  return (
    <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
      <div className="space-y-3 rounded-panel bg-card p-5 ring-1 ring-hairline">
        {outcome === "failed" ? (
          <Notice tone="warn">
            That payment did not go through, so nothing is held and nothing was
            charged. You can try again.
          </Notice>
        ) : null}
        {outcome === "unknown" ? (
          <Notice tone="warn">
            We could not confirm that payment yet. If it went through, the hold
            appears here within a few minutes — do not pay twice.
          </Notice>
        ) : null}

        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground"
          >
            <IconShieldCheck stroke={1.5} className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Hold it for {holdHours} hours — {formatAmount(depositEtb)} ETB
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              A deposit through Chapa (Telebirr, CBE Birr or card) tells the
              seller you are serious and takes the item off the market until you
              can get there. You still pay the rest and collect in person; the
              deposit comes off the price.
            </p>
          </div>
        </div>

        {isLoggedIn ? (
          <Button
            type="button"
            onClick={() => void reserve()}
            disabled={pending}
            className="h-11 w-full rounded-full"
          >
            {pending
              ? "Opening checkout…"
              : `Reserve with ${formatAmount(depositEtb)} ETB`}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link
              href="/login"
              className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
            >
              Log in with Telegram
            </Link>{" "}
            to place a hold.
          </p>
        )}

        {testMode ? (
          <p className="type-ledger text-muted-foreground">
            Test mode — no Chapa key is configured, so the checkout is simulated
            and no money moves.
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}

/** The tray-and-core enclosure the rest of the rail uses, with a state chip. */
function HoldFrame({
  tone,
  icon,
  label,
  children,
}: {
  tone: "held" | "neutral"
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
          <span aria-hidden="true" className="shrink-0">
            {icon}
          </span>
          {label}
        </span>
        {children}
      </div>
    </div>
  )
}

function Notice({
  tone,
  children,
}: {
  tone: "warn"
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-tile px-4 py-3 text-sm leading-relaxed ring-1",
        tone === "warn"
          ? "bg-destructive/8 text-destructive-strong ring-destructive/20"
          : "bg-tray text-muted-foreground ring-hairline"
      )}
    >
      <IconAlertTriangle
        aria-hidden="true"
        stroke={1.5}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>{children}</span>
    </p>
  )
}

import { and, desc, eq, inArray, lte, or } from "drizzle-orm"

import { db } from "@/db/client"
import { reservations, users } from "@/db/schema"
import type { DbReservation } from "@/db/types"
import type { ReservationStatus, ReservationView } from "@/lib/types"

/**
 * The read side of a reservation hold, and the expiry rules that go with it.
 *
 * Split out of lib/reservations.ts for one reason: lib/messaging.ts needs to
 * know whether an item is held — a thread that offers a second deposit on an
 * item it has already said is reserved is worse than one with no payment
 * feature at all — and lib/reservations.ts writes into conversations when a
 * deposit clears. Importing both ways is a cycle. This module imports nothing
 * but the database, so both sides can depend on it.
 */

/** Statuses that actually hold an item. */
export const ACTIVE_HOLD: ReservationStatus[] = ["pending", "paid"]

/**
 * How long an unpaid checkout keeps an item off the market.
 *
 * Not the hold window. A `paid` hold is a promise we made to a buyer who has
 * money down and gets the full `RESERVATION_HOLD_HOURS`. A `pending` row is
 * somebody who opened a payment page — plenty of them close the tab, and one
 * abandoned checkout must not take an item out of the market for a day. Chapa
 * sessions do not last anywhere near this long, so fifteen minutes is generous.
 */
export const PENDING_TTL_MS = 15 * 60 * 1000

/**
 * Has this hold run out? Two clocks, deliberately.
 *
 * A paid hold runs to its own `expires_at`. An unpaid one also has to survive
 * PENDING_TTL_MS since it was created — see the constant.
 */
export function hasLapsed(row: DbReservation, now = Date.now()): boolean {
  if (row.expiresAt.getTime() <= now) return true
  return (
    row.status === "pending" && row.createdAt.getTime() + PENDING_TTL_MS <= now
  )
}

/**
 * Moves every lapsed hold on this listing to `expired`, freeing the partial
 * unique index for the next buyer. Idempotent, and cheap enough to run on the
 * reserve path — it is one indexed UPDATE against at most a handful of rows.
 */
export async function expireStaleHolds(listingId: string): Promise<void> {
  const now = new Date()
  const pendingCutoff = new Date(now.getTime() - PENDING_TTL_MS)

  await db
    .update(reservations)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(reservations.listingId, listingId),
        inArray(reservations.status, ACTIVE_HOLD),
        or(
          lte(reservations.expiresAt, now),
          and(
            eq(reservations.status, "pending"),
            lte(reservations.createdAt, pendingCutoff)
          )
        )
      )
    )
}

/**
 * The live hold on this listing, from `viewerId`'s point of view, or null.
 *
 * Lapsed rows are transitioned to `expired` here and then reported as no hold
 * at all, so a stale `pending` from an abandoned checkout can never keep an item
 * off the market indefinitely. There is no cron behind this: a background job
 * that has to be running for the product to be correct is a job that will not
 * be running during the demo.
 */
export async function getActiveHold(
  listingId: string,
  viewerId: string | null
): Promise<ReservationView | null> {
  const [row] = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.listingId, listingId),
        inArray(reservations.status, ACTIVE_HOLD)
      )
    )
    .orderBy(desc(reservations.createdAt))
    .limit(1)

  if (!row) return null

  if (hasLapsed(row)) {
    await expireStaleHolds(listingId)
    return null
  }

  const viewer =
    viewerId && viewerId === row.buyerId
      ? "buyer"
      : viewerId && viewerId === row.sellerId
        ? "seller"
        : "other"

  /**
   * The counterpart handle is only resolved for the two participants. A hold on
   * a public page tells a stranger the item is taken and nothing about who by.
   */
  let counterpart: string | null = null
  if (viewer !== "other") {
    const otherId = viewer === "buyer" ? row.sellerId : row.buyerId
    const [other] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, otherId))
      .limit(1)
    counterpart = other?.username ?? null
  }

  return {
    id: row.id,
    status: row.status,
    amountEtb: row.amountEtb,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    viewer,
    counterpart,
    // Only the buyer can resume their own abandoned checkout.
    checkoutUrl:
      row.status === "pending" && viewer === "buyer" ? row.checkoutUrl : null,
  }
}

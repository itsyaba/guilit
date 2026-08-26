import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { listings, reservations, users } from "@/db/schema"
import type { DbReservation, User } from "@/db/types"
import {
  appUrl,
  depositForPrice,
  generateTxRef,
  holdHours,
  initializeCharge,
  isChapaMockMode,
  type ChapaVerdict,
} from "@/lib/chapa"
import { ACTIVE_HOLD, expireStaleHolds, getActiveHold } from "@/lib/hold-view"
import { getOrCreateConversation, postSystemMessage } from "@/lib/messaging"
import { formatAmount } from "@/lib/format"
import { escapeHtml, notifyTelegram } from "@/lib/notify"
import type { ReservationStatus } from "@/lib/types"

/**
 * Reservation holds — the state machine around lib/chapa.ts.
 *
 * Everything that changes a hold's status goes through `settleReservation`,
 * including the two callers that race: Chapa's webhook and the buyer's browser
 * coming back from the checkout. Both are told the same thing by the same code,
 * and whichever loses the race gets `changed: false` and does nothing twice.
 *
 * There is no cron sweeping expired holds. Expiry is resolved lazily on read
 * (`getActiveReservation`), which is the same trade lib/price-stats.ts makes:
 * the only moment a lapsed hold matters is when somebody looks at the listing,
 * and a background job that must be running for the product to be correct is a
 * job that will not be running during the demo.
 */

export type ReservationRow = DbReservation

/**
 * Re-exported so callers keep one import for holds. The read side lives in
 * lib/hold-view.ts to break a cycle with lib/messaging — see the note there.
 */
export { getActiveHold as getActiveReservation, expireStaleHolds }

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

/** Holds this user is the buyer on, for their own account view. */
export async function listBuyerReservations(
  buyerId: string
): Promise<DbReservation[]> {
  return db
    .select()
    .from(reservations)
    .where(eq(reservations.buyerId, buyerId))
    .orderBy(desc(reservations.createdAt))
    .limit(50)
}

// --------------------------------------------------------------------------
// Creation
// --------------------------------------------------------------------------

export type CreateHoldFailure =
  | "not_found"
  | "not_live"
  | "no_price"
  | "no_seller"
  | "own_listing"
  | "already_held"
  | "bad_amount"
  | "gateway"

export type CreateHoldResult =
  | { ok: true; reservation: DbReservation; depositEtb: number }
  | { ok: false; reason: CreateHoldFailure }

/**
 * Writes the `pending` row that a Chapa checkout will later settle.
 *
 * The row exists before Chapa is called on purpose — see the comment on the
 * table. It also means the unique partial index, not this function, is what
 * decides who wins when two buyers tap reserve in the same second: the loser's
 * insert raises 23505 and comes back as `already_held`.
 */
export async function createHold(input: {
  listingId: string
  buyerId: string
  /**
   * Overrides the computed deposit. Set only when the buyer is answering a
   * seller's payment request, where the figure was agreed in the thread rather
   * than derived from the asking price.
   */
  amountEtb?: number
  /** The payment_request message this answers, when there is one. */
  requestMessageId?: string
  /** Path to return the buyer to after the checkout. Never a full URL. */
  returnPath?: string
}): Promise<CreateHoldResult> {
  const [listing] = await db
    .select({
      id: listings.id,
      status: listings.status,
      priceEtb: listings.priceEtb,
      sellerId: listings.sellerId,
    })
    .from(listings)
    .where(eq(listings.id, input.listingId))
    .limit(1)

  if (!listing) return { ok: false, reason: "not_found" }
  if (listing.status !== "live") return { ok: false, reason: "not_live" }
  if (!listing.sellerId) return { ok: false, reason: "no_seller" }
  if (listing.sellerId === input.buyerId) return { ok: false, reason: "own_listing" }

  const computed = depositForPrice(listing.priceEtb)
  if (computed === null) return { ok: false, reason: "no_price" }

  /**
   * A requested amount is still bounded here.
   *
   * The request came from the seller and the buyer agreed to it, but this is the
   * function that writes a charge, so it is the function that refuses a figure
   * above the item's own price or below one birr. Trusting the caller because
   * the caller already validated is how the second caller ships without doing so.
   */
  const deposit = input.amountEtb ?? computed
  if (
    !Number.isInteger(deposit) ||
    deposit < 1 ||
    (listing.priceEtb !== null && deposit > listing.priceEtb)
  ) {
    return { ok: false, reason: "bad_amount" }
  }

  /**
   * Clear anything stale before trying to insert.
   *
   * Without this, expiry would only ever be resolved by someone *reading* the
   * listing page, and a buyer arriving straight at this route — a bookmarked
   * page, a cached render, a second tab — would be refused by a hold that
   * lapsed hours ago.
   */
  await expireStaleHolds(input.listingId)

  const expiresAt = new Date(Date.now() + holdHours() * 60 * 60 * 1000)

  try {
    const [row] = await db
      .insert(reservations)
      .values({
        listingId: listing.id,
        buyerId: input.buyerId,
        sellerId: listing.sellerId,
        amountEtb: deposit,
        priceEtbAtReservation: listing.priceEtb,
        txRef: generateTxRef(),
        expiresAt,
        requestMessageId: input.requestMessageId ?? null,
        returnPath: safeReturnPath(input.returnPath),
      })
      .returning()

    return { ok: true, reservation: row, depositEtb: deposit }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Someone else's hold is live, or this buyer's own earlier one still is.
      return { ok: false, reason: "already_held" }
    }
    throw error
  }
}

/**
 * Keeps a return target to a same-site path.
 *
 * This value is handed to a redirect after payment. Anything with a scheme or a
 * protocol-relative prefix would turn the verify route into an open redirect
 * that arrives with the credibility of a completed payment, which is exactly the
 * shape a phishing flow wants.
 */
function safeReturnPath(path: string | undefined): string | null {
  if (!path) return null
  if (!path.startsWith("/") || path.startsWith("//")) return null
  return path.slice(0, 200)
}

/**
 * Postgres unique-violation detection, walking the cause chain.
 *
 * Drizzle wraps the driver's error in its own `DrizzleQueryError` and hangs the
 * original off `cause`, so the SQLSTATE is one or two levels down rather than on
 * the error it hands back. Checking only the top level compiles, passes review,
 * and then turns the second buyer tapping "reserve" into a 500 instead of the
 * 409 the partial unique index exists to produce.
 */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * HTTP shape for each failure, so the listing route and the in-thread pay route
 * cannot drift into telling a buyer two different things about the same refusal.
 */
export const HOLD_FAILURE_RESPONSE: Record<
  CreateHoldFailure,
  { status: number; error: string }
> = {
  not_found: { status: 404, error: "Listing not found." },
  not_live: { status: 409, error: "This listing is no longer available." },
  no_seller: {
    status: 409,
    error:
      "This listing came from a Telegram channel and has no seller account to hold it — contact the seller directly.",
  },
  no_price: {
    status: 409,
    error: "This listing has no price, so there is nothing to hold it against.",
  },
  own_listing: { status: 409, error: "This is your own listing." },
  already_held: {
    status: 409,
    error:
      "Someone is already holding this item. Check back when the hold lapses.",
  },
  bad_amount: {
    status: 400,
    error: "That amount does not look right. It cannot exceed the item's price.",
  },
  gateway: {
    status: 502,
    error: "Could not open the checkout. Nothing was charged.",
  },
}

export type OpenCheckoutResult =
  | {
      ok: true
      reservation: DbReservation
      checkoutUrl: string
      depositEtb: number
      testMode: boolean
    }
  | { ok: false; reason: CreateHoldFailure; error: string }

/**
 * Writes the hold and opens a Chapa checkout for it.
 *
 * Both entry points — the listing page's reserve button and a buyer answering a
 * payment request inside a thread — land here, because the sequence has three
 * steps that must stay together: create the row, ask Chapa, and *release the row
 * if Chapa says no*. Duplicating that in two routes is how one of them ends up
 * leaving a `pending` row behind on a failed init, quietly holding an item for a
 * checkout that never opened.
 */
export async function openCheckout(input: {
  listingId: string
  buyer: User
  amountEtb?: number
  requestMessageId?: string
  returnPath?: string
  /** Request origin, used only if NEXT_PUBLIC_APP_URL is unset. */
  origin?: string
}): Promise<OpenCheckoutResult> {
  const hold = await createHold({
    listingId: input.listingId,
    buyerId: input.buyer.id,
    amountEtb: input.amountEtb,
    requestMessageId: input.requestMessageId,
    returnPath: input.returnPath,
  })

  if (!hold.ok) {
    return {
      ok: false,
      reason: hold.reason,
      error: HOLD_FAILURE_RESPONSE[hold.reason].error,
    }
  }

  const { reservation, depositEtb } = hold
  const base = appUrl(input.origin)
  const settleUrl = `${base}/api/payments/chapa/verify?tx_ref=${encodeURIComponent(
    reservation.txRef
  )}`
  const handle = input.buyer.username ?? "gulit-buyer"

  const init = await initializeCharge({
    txRef: reservation.txRef,
    amountEtb: depositEtb,
    /**
     * Chapa requires an email and we deliberately do not collect one — Telegram
     * login gives us a handle, and asking for an address we would never use is
     * personal data collected for no purpose, which Proclamation 1321/2024 is
     * specifically about. A per-account address on our own domain satisfies the
     * field without inventing a contact route.
     */
    email: `${handle}@users.gulit.et`,
    firstName: handle,
    lastName: "Gulit",
    phone: input.buyer.phone,
    title: "Gulit hold",
    description: `Refundable deposit to hold this item for ${holdHours()} hours.`,
    returnUrl: settleUrl,
    // Chapa calls this server-side. It lands on the same handler because the
    // handler is idempotent — whichever of the two arrives first settles the row.
    callbackUrl: settleUrl,
  })

  if (!init.ok) {
    // The pending row would otherwise block this listing until it expired, for
    // a checkout that never opened.
    await failPendingHold(reservation.id)
    console.error(`[reserve] chapa init failed: ${init.error} ${init.detail ?? ""}`)
    return { ok: false, reason: "gateway", error: init.error }
  }

  await attachCheckoutUrl(reservation.id, init.checkoutUrl)

  return {
    ok: true,
    reservation,
    checkoutUrl: init.checkoutUrl,
    depositEtb,
    testMode: init.mocked,
  }
}

/** Records the checkout URL Chapa handed back, so an abandoned hold is resumable. */
export async function attachCheckoutUrl(
  reservationId: string,
  checkoutUrl: string
): Promise<void> {
  await db
    .update(reservations)
    .set({ checkoutUrl, updatedAt: new Date() })
    .where(eq(reservations.id, reservationId))
}

/** Abandons a `pending` row whose checkout never opened. */
export async function failPendingHold(
  reservationId: string
): Promise<void> {
  await db
    .update(reservations)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(eq(reservations.id, reservationId), eq(reservations.status, "pending"))
    )
}

// --------------------------------------------------------------------------
// Settlement
// --------------------------------------------------------------------------

export type SettleResult = {
  reservation: DbReservation | null
  /** False when this call was a duplicate — the row was already settled. */
  changed: boolean
}

/**
 * Applies a verified Chapa verdict to a hold. Idempotent.
 *
 * The `status = 'pending'` predicate in the UPDATE is the idempotency: only one
 * of the racing callers can move the row out of pending, and the other one's
 * UPDATE matches zero rows and returns `changed: false`. That is also why the
 * side effects — the system message, the seller's Telegram ping — sit behind
 * that flag rather than behind an `if (verdict === 'success')`, which would
 * fire twice.
 */
export async function settleReservation(
  txRef: string,
  verdict: ChapaVerdict,
  payload: unknown
): Promise<SettleResult> {
  const [existing] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.txRef, txRef))
    .limit(1)

  if (!existing) return { reservation: null, changed: false }
  if (verdict === "pending") {
    return { reservation: existing, changed: false }
  }

  const now = new Date()
  const nextStatus: ReservationStatus = verdict === "success" ? "paid" : "failed"

  const [updated] = await db
    .update(reservations)
    .set({
      status: nextStatus,
      providerPayload: payload as Record<string, unknown>,
      paidAt: verdict === "success" ? now : null,
      updatedAt: now,
    })
    .where(
      and(eq(reservations.id, existing.id), eq(reservations.status, "pending"))
    )
    .returning()

  if (!updated) return { reservation: existing, changed: false }

  if (nextStatus === "paid") {
    await announceHold(updated)
  }

  return { reservation: updated, changed: true }
}

/**
 * Tells both sides a deposit cleared, in the thread about that item.
 *
 * A hold that only exists as a badge on a page nobody reloads is not a
 * reservation anybody acts on. Putting it in the conversation means the seller
 * gets it where they are already talking to this buyer, and the buyer has a
 * written record of what they paid and until when.
 *
 * Failures here are logged, never thrown: the money has cleared and the hold is
 * recorded, and a Telegram outage must not turn that into a 500 that makes the
 * caller retry a settled payment.
 */
async function announceHold(row: DbReservation): Promise<void> {
  try {
    const conversation = await getOrCreateConversation({
      listingId: row.listingId,
      buyerId: row.buyerId,
      sellerId: row.sellerId,
    })

    const until = row.expiresAt.toLocaleString("en-GB", {
      timeZone: "Africa/Addis_Ababa",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })

    await postSystemMessage(
      conversation.id,
      `Deposit of ${formatAmount(row.amountEtb)} ETB received${
        isChapaMockMode() ? " (test mode)" : ""
      } via Chapa. This item is held for the buyer until ${until} (Addis time). The deposit counts toward the price on handover.`
    )

    const [seller] = await db
      .select({ telegramId: users.telegramId })
      .from(users)
      .where(eq(users.id, row.sellerId))
      .limit(1)

    const [listing] = await db
      .select({ title: listings.titleEn, slug: listings.slug })
      .from(listings)
      .where(eq(listings.id, row.listingId))
      .limit(1)

    if (seller?.telegramId && listing) {
      void notifyTelegram(
        seller.telegramId,
        `<b>Deposit received</b>\n${escapeHtml(listing.title)} is reserved until ${escapeHtml(
          until
        )}.\nOpen the thread: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/messages`
      )
    }
  } catch (error) {
    console.error(
      `[reservations] announce failed for ${row.txRef}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Seller-side close-out: the handover happened, or it did not.
 *
 * `completed` and `cancelled` both end the hold and free the listing; the
 * distinction is what we tell the buyer about their money, which is why they are
 * separate statuses rather than one `closed`.
 */
export async function closeHold(
  reservationId: string,
  actorId: string,
  outcome: "completed" | "cancelled"
): Promise<DbReservation | null> {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1)

  if (!row) return null
  // Either participant may cancel; only the seller can declare it handed over.
  const permitted =
    outcome === "cancelled"
      ? actorId === row.buyerId || actorId === row.sellerId
      : actorId === row.sellerId
  if (!permitted) return null

  const [updated] = await db
    .update(reservations)
    .set({ status: outcome, updatedAt: new Date() })
    .where(
      and(eq(reservations.id, row.id), inArray(reservations.status, ACTIVE_HOLD))
    )
    .returning()

  if (!updated) return row

  try {
    const conversation = await getOrCreateConversation({
      listingId: row.listingId,
      buyerId: row.buyerId,
      sellerId: row.sellerId,
    })
    await postSystemMessage(
      conversation.id,
      outcome === "completed"
        ? `Handover confirmed by the seller. The ${formatAmount(row.amountEtb)} ETB deposit counts toward the price.`
        : `The hold on this item was cancelled. The ${formatAmount(row.amountEtb)} ETB deposit is refundable — contact support if it has not appeared within three working days.`
    )
  } catch (error) {
    console.error(
      `[reservations] close-out note failed for ${row.txRef}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  return updated
}

/** Count of holds ever placed — a real number for the admin dashboard. */
export async function countPaidHolds(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reservations)
    .where(inArray(reservations.status, ["paid", "completed"]))
  return Number(row?.count ?? 0)
}

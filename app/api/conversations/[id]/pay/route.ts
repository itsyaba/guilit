import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { conversations } from "@/db/schema"
import { holdHours } from "@/lib/chapa"
import { getPayableRequest } from "@/lib/messaging"
import { checkRateLimit } from "@/lib/rate-limit"
import { HOLD_FAILURE_RESPONSE, openCheckout } from "@/lib/reservations"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/conversations/[id]/pay
 *
 * Pays from inside the thread. Expected body:
 *   { requestMessageId?: string }
 *
 * With a request id, the amount is the one the seller asked for in that message.
 * Without one, it is the listing's computed deposit — the same thing the reserve
 * button on the listing page does, offered here so a buyer who has just agreed
 * to meet does not have to navigate back to the item to act on it.
 *
 * The request id is re-validated rather than trusted. `getPayableRequest`
 * refuses one that has been superseded by a later request, already paid, or
 * overtaken by somebody else's hold — all of which a stale browser tab will
 * still happily show a button for.
 *
 * Buyer only. The seller asks; they do not pay themselves.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to pay a deposit." },
        { status: 401 }
      )
    }
    throw error
  }

  // Same window as the listing route, and the same key, so a buyer cannot get
  // twenty checkout sessions by alternating between the two entry points.
  const allowed = await checkRateLimit(`reserve:${user.id}`, 10, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "Too many payment attempts. Try again in an hour." },
      { status: 429 }
    )
  }

  const [conversation] = await db
    .select({ listingId: conversations.listingId })
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.buyerId, user.id)))
    .limit(1)

  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  const requestMessageId =
    typeof body?.requestMessageId === "string" ? body.requestMessageId : null

  let amountEtb: number | undefined
  if (requestMessageId) {
    if (!isUuid(requestMessageId)) {
      return Response.json({ error: "Unknown request." }, { status: 400 })
    }
    const payable = await getPayableRequest(id, user.id, requestMessageId)
    if (!payable) {
      return Response.json(
        {
          error:
            "That request can no longer be paid — the seller may have replaced it, or the item is already on hold.",
        },
        { status: 409 }
      )
    }
    amountEtb = payable.amountEtb
  }

  const result = await openCheckout({
    listingId: conversation.listingId,
    buyer: user,
    amountEtb,
    requestMessageId: requestMessageId ?? undefined,
    // Paying inside a conversation must come back to that conversation. Landing
    // on the listing page afterwards loses the context the payment was about.
    returnPath: `/messages/${id}`,
    origin: request.nextUrl.origin,
  })

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: HOLD_FAILURE_RESPONSE[result.reason].status }
    )
  }

  return Response.json(
    {
      reservationId: result.reservation.id,
      checkoutUrl: result.checkoutUrl,
      depositEtb: result.depositEtb,
      holdHours: holdHours(),
      expiresAt: result.reservation.expiresAt.toISOString(),
      testMode: result.testMode,
    },
    { status: 201 }
  )
}

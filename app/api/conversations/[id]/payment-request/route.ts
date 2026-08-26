import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { conversations, listings, users } from "@/db/schema"
import { formatAmount } from "@/lib/format"
import { postPaymentRequest } from "@/lib/messaging"
import { escapeHtml, notifyTelegram } from "@/lib/notify"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/conversations/[id]/payment-request
 *
 * The seller asking for a specific figure, inside the thread where it was
 * agreed. Expected body: { amountEtb: number, note?: string }
 *
 * This is the half of "shop from chat" that the listing page cannot do. The
 * deposit on a listing is derived from the asking price, but a used-goods
 * conversation is a negotiation — the number that matters is the one the two of
 * them settled on three messages ago, and until now there was no way to turn
 * that into something payable without leaving the thread.
 *
 * Seller only. A buyer able to post a request would be writing their own
 * invoice.
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
      return Response.json({ error: "Not authenticated." }, { status: 401 })
    }
    throw error
  }

  const allowed = await checkRateLimit(`payment-request:${user.id}`, 20, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "Too many payment requests. Try again in an hour." },
      { status: 429 }
    )
  }

  const [conversation] = await db
    .select({
      id: conversations.id,
      buyerId: conversations.buyerId,
      sellerId: conversations.sellerId,
      listingStatus: listings.status,
      listingTitle: listings.titleEn,
      priceEtb: listings.priceEtb,
    })
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .where(and(eq(conversations.id, id), eq(conversations.sellerId, user.id)))
    .limit(1)

  // Not-yours and not-found give the same answer, as everywhere else in this
  // API — a buyer probing this route should not learn that the thread exists.
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }
  if (conversation.listingStatus !== "live") {
    return Response.json(
      { error: "This listing is no longer live." },
      { status: 409 }
    )
  }

  const body = await request.json().catch(() => null)
  const amountEtb = Number(body?.amountEtb)

  if (!Number.isInteger(amountEtb) || amountEtb < 1) {
    return Response.json(
      { error: "Enter a whole number of birr." },
      { status: 400 }
    )
  }
  /**
   * Capped at the asking price. A deposit larger than the item is either a typo
   * or a seller using a hold as a full checkout, and the hold is deliberately
   * not that — the buyer still pays the balance in person.
   */
  if (conversation.priceEtb !== null && amountEtb > conversation.priceEtb) {
    return Response.json(
      {
        error: `That is more than the asking price (${formatAmount(
          conversation.priceEtb
        )} ETB).`,
      },
      { status: 400 }
    )
  }

  const note = typeof body?.note === "string" ? body.note : null

  const message = await postPaymentRequest({
    conversationId: conversation.id,
    sellerId: user.id,
    amountEtb,
    note,
  })

  const [buyer] = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.id, conversation.buyerId))
    .limit(1)

  if (buyer?.telegramId) {
    void notifyTelegram(
      buyer.telegramId,
      [
        `<b>Deposit requested: ${formatAmount(amountEtb)} ETB</b>`,
        escapeHtml(conversation.listingTitle),
        "",
        `Pay to hold it: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/messages/${conversation.id}`,
      ].join("\n")
    )
  }

  return Response.json({ message }, { status: 201 })
}

import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { listings } from "@/db/schema"
import {
  canMessage,
  getOrCreateConversation,
  MESSAGE_MAX_CHARS,
  notifyCounterpart,
  postMessage,
} from "@/lib/messaging"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/messages
 *
 * Opens a thread with this listing's seller, or appends to the one that already
 * exists. This is the buyer's entry point; every message after the first goes
 * through /api/conversations/[id]/messages instead.
 *
 * Only listings with a registered seller accept messages — an indexed listing
 * has no account behind it and contact there routes to the original Telegram
 * post. See lib/messaging.ts canMessage.
 *
 * Expected body: { body: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to message the seller." },
        { status: 401 }
      )
    }
    throw error
  }

  /**
   * Per-account rather than per-IP: the abuse this stops is one account
   * spraying the same question at forty sellers, and behind a shared mobile
   * carrier NAT an IP window would take honest users down with it.
   */
  const allowed = await checkRateLimit(`message:${user.id}`, 40, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "That's a lot of messages at once. Try again in an hour." },
      { status: 429 }
    )
  }

  const payload = await request.json().catch(() => null)
  const body = typeof payload?.body === "string" ? payload.body.trim() : ""
  if (!body) {
    return Response.json({ error: "Write a message first." }, { status: 400 })
  }
  if (body.length > MESSAGE_MAX_CHARS) {
    return Response.json(
      { error: `Keep it under ${MESSAGE_MAX_CHARS} characters.` },
      { status: 400 }
    )
  }

  const [listing] = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      status: listings.status,
    })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1)

  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }
  if (!canMessage(listing)) {
    return Response.json(
      {
        error:
          "This seller isn't reachable here — use the Telegram or phone link on the listing.",
      },
      { status: 409 }
    )
  }
  if (listing.sellerId === user.id) {
    return Response.json(
      { error: "This is your own listing." },
      { status: 409 }
    )
  }

  const conversation = await getOrCreateConversation({
    listingId: listing.id,
    buyerId: user.id,
    sellerId: listing.sellerId!,
  })

  const message = await postMessage({
    conversationId: conversation.id,
    senderId: user.id,
    body,
  })

  // Not awaited: the message is committed, and Telegram reach is a bonus rather
  // than part of the write.
  void notifyCounterpart(conversation.id, user.id, body)

  return Response.json(
    { conversationId: conversation.id, message },
    { status: 201 }
  )
}

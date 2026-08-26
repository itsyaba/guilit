import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { listings } from "@/db/schema"
import { depositForPrice, holdHours } from "@/lib/chapa"
import { checkRateLimit } from "@/lib/rate-limit"
import { HOLD_FAILURE_RESPONSE, openCheckout } from "@/lib/reservations"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/reserve
 *
 * Takes a deposit through Chapa to hold an item, and returns the checkout URL
 * the browser should go to. Nothing is charged by this route itself — it writes
 * a `pending` row, asks Chapa for a hosted checkout, and hands back the link.
 * The hold only becomes real when /api/payments/chapa/verify or the webhook
 * confirms it.
 *
 * This is the listing-page entry point, at the computed deposit. The other one
 * is /api/conversations/[id]/pay, where the figure was agreed in a thread. Both
 * go through lib/reservations.openCheckout.
 *
 * This is not a purchase. See db/schema/reservations.ts for why a marketplace
 * for second-hand goods sold hand to hand should not pretend to be a checkout.
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
        { error: "Log in with Telegram to reserve an item." },
        { status: 401 }
      )
    }
    throw error
  }

  /**
   * Tighter than the messaging limit and for a different reason: every attempt
   * here opens a payment session at Chapa, and an account cycling through
   * checkouts it never completes is a pattern their risk team notices before we
   * do.
   */
  const allowed = await checkRateLimit(`reserve:${user.id}`, 10, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "Too many reservation attempts. Try again in an hour." },
      { status: 429 }
    )
  }

  const result = await openCheckout({
    listingId: id,
    buyer: user,
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
      /** True when no Chapa key is configured — surfaced so the UI can say so. */
      testMode: result.testMode,
    },
    { status: 201 }
  )
}

/**
 * GET /api/listings/[id]/reserve
 *
 * What a hold on this item would cost, without creating one. The listing page
 * renders the figure server-side; this is for a client that wants it before
 * committing the user to a checkout.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  const [listing] = await db
    .select({ priceEtb: listings.priceEtb })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1)

  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  return Response.json({
    depositEtb: depositForPrice(listing.priceEtb),
    holdHours: holdHours(),
  })
}

import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"

import { db } from "@/db/client"
import { listings, removalRequests, reports } from "@/db/schema"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/remove
 *
 * "This is mine, remove it" — one tap, no paperwork, no reason asked. Scoped
 * to indexed listings only: a claimed/native listing has an actual owner
 * account and should go through that flow instead. Never a hard delete —
 * status flips to 'removed' and a reports row keeps the audit trail, same as
 * every other moderation action.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  const [listing] = await db
    .select({ id: listings.id, tier: listings.tier, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1)
  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }
  if (listing.tier !== "indexed") {
    return Response.json(
      { error: "This listing has an owner account — remove it from there instead." },
      { status: 400 }
    )
  }

  const ip = getClientIp(request)
  const allowed = await checkRateLimit(`remove:ip:${ip}`, 10, 60 * 60)
  if (!allowed) {
    return Response.json({ error: "Too many requests. Try again later." }, { status: 429 })
  }

  let body: { phone?: string; name?: string; detail?: string } = {}
  try {
    body = await request.json()
  } catch {
    // ignore — body is optional for remove requests
  }

  if (listing.status !== "removed") {
    const [existing] = await db
      .select({ id: removalRequests.id })
      .from(removalRequests)
      .where(and(eq(removalRequests.listingId, id), eq(removalRequests.status, 'pending')))
      .limit(1)

    if (!existing) {
      await db.insert(removalRequests).values({
        listingId: id,
        claimantPhone: body.phone ?? null,
        claimantName: body.name ?? null,
        detail: body.detail ?? null,
      })
    }
    
    return Response.json({ listingId: id, status: 'pending_review', message: 'Your removal request has been received and will be reviewed by our team.' }, { status: 202 })
  }

  return Response.json({ listingId: id, status: "removed" })
}

import type { NextRequest } from "next/server"
import { eq, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { listings, reports } from "@/db/schema"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { getSessionUser } from "@/lib/session"
import { isUuid } from "@/lib/utils"

/**
 * POST /api/listings/[id]/report
 *
 * Submits a user report against a listing. Reporter is optional — anonymous
 * reports are accepted. 3+ reports → auto-hide + queue for review.
 *
 * Expected body: { reason: string, detail?: string }
 * params is a Promise in Next.js 16 — must be awaited before use.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }
  const body = await request.json().catch(() => ({}))
  const reason: string =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "unspecified"
  const detail: string | undefined = typeof body.detail === "string" ? body.detail : undefined

  const [listing] = await db
    .select({ id: listings.id, status: listings.status })
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1)
  if (!listing) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  const ip = getClientIp(request)
  const allowed = await checkRateLimit(`report:ip:${ip}`, 5, 60 * 60)
  if (!allowed) {
    return Response.json(
      { error: "Too many reports. Try again later." },
      { status: 429 }
    )
  }

  const user = await getSessionUser()
  await db.insert(reports).values({ listingId: id, reporterId: user?.id, reason, detail })

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(reports)
    .where(eq(reports.listingId, id))

  if (Number(total) >= 3 && listing.status !== "hidden") {
    await db
      .update(listings)
      .set({ status: "hidden", updatedAt: new Date() })
      .where(eq(listings.id, id))
  }

  return Response.json(
    {
      listingId: id,
      status: "received",
      reason,
      message: "Thank you. Our team will review this listing.",
    },
    { status: 202 }
  )
}

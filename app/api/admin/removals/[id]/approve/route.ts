import type { NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { listings, moderationLogs, removalRequests } from "@/db/schema"
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/session"
import { isUuid } from "@/lib/utils"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const { id } = await params
  const reqId = parseInt(id, 10)
  if (isNaN(reqId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 })
  }

  const [removalReq] = await db
    .select()
    .from(removalRequests)
    .where(and(eq(removalRequests.id, reqId), eq(removalRequests.status, 'pending')))
    .limit(1)

  if (!removalReq) {
    return Response.json({ error: "Removal request not found or not pending" }, { status: 404 })
  }

  await db.transaction(async (tx) => {
    await tx.update(removalRequests)
      .set({ status: 'approved', resolvedAt: new Date(), resolvedBy: admin.id })
      .where(eq(removalRequests.id, reqId))
      
    await tx.update(listings)
      .set({ status: 'removed', updatedAt: new Date() })
      .where(eq(listings.id, removalReq.listingId))
      
    await tx.insert(moderationLogs).values({
      actorId: admin.id,
      listingId: removalReq.listingId,
      action: 'removal_approved',
    })
  })

  return Response.json({ success: true })
}

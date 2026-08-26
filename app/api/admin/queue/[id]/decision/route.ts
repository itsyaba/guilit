import type { NextRequest } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db/client"
import { channels, listingSources, listings, moderationLogs, rawMessages } from "@/db/schema"
import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/lib/session"
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
  if (!isUuid(id)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 })
  }

  const body = await request.json()
  const { action, edits, reason } = body

  if (!['approve', 'approve_with_edits', 'reject', 'ban_channel'].includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 })
  }

  const [listing] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.status, 'queued')))
    .limit(1)

  if (!listing) {
    return Response.json({ error: "Listing not found or not in queued status" }, { status: 404 })
  }

  const result = await db.transaction(async (tx) => {
    let newStatus = listing.status
    let channelId = null

    if (action === 'approve') {
      newStatus = 'live'
      await tx.update(listings).set({ status: 'live', updatedAt: new Date() }).where(eq(listings.id, id))
    } else if (action === 'approve_with_edits') {
      newStatus = 'live'
      // Build the update set from only the keys present in edits
      const set: Partial<{
        status: 'live' | 'queued' | 'hidden' | 'removed'
        updatedAt: Date
        titleEn: string
        titleAm: string
        descriptionEn: string
        descriptionAm: string
        priceEtb: number
        categorySlug: string
        condition: 'brand_new' | 'lightly_used' | 'fair'
        locationArea: string
      }> = { status: 'live', updatedAt: new Date() }
      if (typeof edits?.titleEn === 'string') set.titleEn = edits.titleEn
      if (typeof edits?.titleAm === 'string') set.titleAm = edits.titleAm
      if (typeof edits?.descriptionEn === 'string') set.descriptionEn = edits.descriptionEn
      if (typeof edits?.descriptionAm === 'string') set.descriptionAm = edits.descriptionAm
      if (edits?.priceEtb != null) set.priceEtb = Number(edits.priceEtb)
      if (typeof edits?.categorySlug === 'string') set.categorySlug = edits.categorySlug
      if (edits?.condition != null) set.condition = edits.condition
      if (typeof edits?.locationArea === 'string') set.locationArea = edits.locationArea
      await tx.update(listings).set(set).where(eq(listings.id, id))
    } else if (action === 'reject') {
      newStatus = 'removed'
      await tx.update(listings).set({ status: 'removed', updatedAt: new Date() }).where(eq(listings.id, id))
    } else if (action === 'ban_channel') {
      newStatus = 'removed'
      const [source] = await tx
        .select({ channelId: rawMessages.channelId })
        .from(listingSources)
        .innerJoin(rawMessages, eq(rawMessages.id, listingSources.rawMessageId))
        .where(eq(listingSources.listingId, id))
        .limit(1)
        
      if (source && source.channelId) {
        channelId = source.channelId
        await tx.update(channels).set({ active: false, updatedAt: new Date() }).where(eq(channels.id, channelId))
        
        // Find all queued listings from this channel and mark as removed
        const queuedListingsFromChannel = await tx
          .select({ id: listings.id })
          .from(listings)
          .innerJoin(listingSources, eq(listingSources.listingId, listings.id))
          .innerJoin(rawMessages, eq(rawMessages.id, listingSources.rawMessageId))
          .where(and(
            eq(rawMessages.channelId, channelId),
            eq(listings.status, 'queued')
          ))
          
        if (queuedListingsFromChannel.length > 0) {
          const ids = queuedListingsFromChannel.map(l => l.id)
          await tx.update(listings).set({ status: 'removed', updatedAt: new Date() }).where(inArray(listings.id, ids))
        }
      } else {
        await tx.update(listings).set({ status: 'removed', updatedAt: new Date() }).where(eq(listings.id, id))
      }
    }

    const [log] = await tx.insert(moderationLogs).values({
      listingId: id,
      actorId: admin.id,
      action: action,
      reason: reason || null,
      editsBefore: action === 'approve_with_edits' ? listing : null,
      editsAfter: action === 'approve_with_edits' ? edits : null,
      channelId: channelId,
    }).returning({ id: moderationLogs.id })

    return { listingId: id, action, newStatus, logId: log.id }
  })

  return Response.json(result)
}

import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db/client"
import { channels, moderationLogs } from "@/db/schema"
import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/lib/session"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const { id } = await params
  const channelId = parseInt(id, 10)
  if (isNaN(channelId)) {
    return Response.json({ error: "Invalid channel ID" }, { status: 400 })
  }

  const body = await request.json()
  const { active } = body

  if (typeof active !== 'boolean') {
    return Response.json({ error: "active must be a boolean" }, { status: 400 })
  }

  const [channel] = await db.update(channels)
    .set({ active, updatedAt: new Date() })
    .where(eq(channels.id, channelId))
    .returning()

  if (!channel) {
    return Response.json({ error: "Channel not found" }, { status: 404 })
  }

  await db.insert(moderationLogs).values({
    actorId: admin.id,
    action: 'toggle_channel',
    channelId: channelId,
  })

  return Response.json(channel)
}

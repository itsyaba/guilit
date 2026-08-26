import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/lib/session"
import { getModerationQueue } from "@/lib/moderation-queue"

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const items = await getModerationQueue()
  return Response.json({ items, total: items.length, nextCursor: null })
}

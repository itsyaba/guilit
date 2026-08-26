import { desc } from "drizzle-orm"
import { db } from "@/db/client"
import { reports } from "@/db/schema"
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/session"
import { getListing } from "@/lib/listings"

export async function GET() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 })
    if (err instanceof ForbiddenError) return Response.json({ error: "Forbidden" }, { status: 403 })
    throw err
  }

  const rows = await db
    .select({
      id: reports.id,
      listingId: reports.listingId,
      reason: reports.reason,
      detail: reports.detail,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(100)

  const items = await Promise.all(
    rows.map(async (row) => {
      const listing = await getListing(row.listingId)
      return {
        ...row,
        listing,
      }
    })
  )

  return Response.json({ items })
}

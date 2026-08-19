import { asc, eq } from "drizzle-orm"
import { db } from "@/db/client"
import { removalRequests } from "@/db/schema"
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
    .select()
    .from(removalRequests)
    .where(eq(removalRequests.status, 'pending'))
    .orderBy(asc(removalRequests.createdAt))
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

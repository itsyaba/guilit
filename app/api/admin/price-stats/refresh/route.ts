import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/lib/session"
import { refreshPriceStats } from "@/lib/price-stats"

/**
 * POST /api/admin/price-stats/refresh
 *
 * Forces a rebuild of the price_stats table. The scheduler in
 * instrumentation.ts already does this on an interval; this exists so an
 * operator can warm the table deliberately — notably before `make snapshot`, so
 * a restored database ships with usable statistics rather than an empty table.
 */
export async function POST() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (err instanceof ForbiddenError) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
    throw err
  }

  const result = await refreshPriceStats()
  return Response.json(result)
}

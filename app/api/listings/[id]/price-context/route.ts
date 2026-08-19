import type { NextRequest } from "next/server"

import { ensureFreshPriceStats, getPriceContext } from "@/lib/price-stats"
import { isUuid } from "@/lib/utils"

/**
 * GET /api/listings/[id]/price-context
 *
 * The typical price range for comparable listings, and where this one sits in
 * it. Fetched by components/listing/price-check.tsx rather than passed down
 * from the page, because the listing pages are prerendered and these numbers
 * are refreshed on a schedule — baking them into the HTML would freeze them
 * at build time.
 *
 * A thin comparison set answers 200 with `available: false` and a reason, not
 * an error status: showing no range is a designed outcome, and the reason is
 * what makes the minimum-sample rule checkable from outside.
 *
 * Not rate limited on purpose. It is a public read of pre-aggregated data for a
 * listing id the caller already holds, and checkRateLimit writes a row per
 * call — metering a per-page-view GET would grow rate_limit_hits as fast as
 * traffic for no protection.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // Postgres throws on a malformed uuid literal — a typo should be a 404.
  if (!isUuid(id)) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  // Backstop for the scheduler in instrumentation.ts: if it never ran, the
  // first page view still gets real numbers instead of an empty table.
  await ensureFreshPriceStats()

  const context = await getPriceContext(id)
  if (!context) {
    return Response.json({ error: "Listing not found." }, { status: 404 })
  }

  return Response.json(context, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=900" },
  })
}

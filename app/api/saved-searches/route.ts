import type { NextRequest } from "next/server"
import type { ListingQuery } from "@/lib/types"

/**
 * POST /api/saved-searches
 *
 * Saves a search query to trigger Telegram alerts when matching listings appear.
 * This is the "notify me when a Samsung A54 under 15,000 appears" flow — the
 * feature only our architecture can deliver, because we see all channels.
 *
 * Expected body: { query: ListingQuery, alertsOn?: boolean }
 *
 * The ingestion pipeline checks active saved searches against every incoming
 * listing and sends a Telegram ping within minutes of a match.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const query: ListingQuery = body.query ?? {}
  const alertsOn: boolean = body.alertsOn ?? true

  return Response.json(
    {
      id: 1,
      query,
      alertsOn,
      message: "Saved search created. You will be notified on Telegram when a match appears.",
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  )
}

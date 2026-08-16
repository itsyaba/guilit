import type { NextRequest } from "next/server"
import type { ListingsPage } from "@/lib/types"
import { getListings, parseListingQuery } from "@/lib/listings"

/**
 * GET /api/listings
 *
 * Accepts all ListingQuery fields as search params.
 * Currently delegates to the fixture-backed lib/listings module.
 * When the DB is wired, only this handler changes — not the components.
 *
 * @example
 *   GET /api/listings?category=electronics&sort=price_asc&page=2
 */
export async function GET(request: NextRequest) {
  const raw: Record<string, string | string[]> = {}
  request.nextUrl.searchParams.forEach((value, key) => {
    const existing = raw[key]
    if (existing === undefined) {
      raw[key] = value
    } else {
      raw[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value]
    }
  })

  const query = parseListingQuery(raw)
  const page: ListingsPage = await getListings(query)
  return Response.json(page)
}

/**
 * POST /api/listings
 *
 * Creates a new native listing (direct post by a verified user).
 * Returns 201 with stub data; real implementation will validate body,
 * write to DB, and enqueue extraction/moderation jobs.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  return Response.json(
    {
      id: "stub-new-listing-id",
      status: "queued",
      message: "Listing received and queued for review.",
      received: body,
    },
    { status: 201 }
  )
}

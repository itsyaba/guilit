import type { NextRequest } from "next/server"
import type { ListingQuery } from "@/lib/types"

/**
 * POST /api/search/parse
 *
 * Accepts a natural-language query string and returns a structured
 * ListingQuery object — one Gemini Flash-Lite call in production.
 *
 * The parsed query is sent back to the client, which redirects the user
 * to /browse with filter chips pre-applied and editable. This is NOT a
 * chat interface; it is a single call that converts a sentence into filter
 * state.
 *
 * Expected body: { q: string }
 * Returns: ListingQuery
 *
 * Example: "bag under 3000 birr" →
 *   { category: "clothing", maxPrice: 3000 }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const q: string = body.q ?? ""

  // Stub: echo back a plausible parsed query shape.
  // Real implementation: call Gemini Flash-Lite with the NL→filter prompt.
  const parsed: ListingQuery = {
    q: q || undefined,
    category: undefined,
    condition: [],
    tier: [],
    area: undefined,
    minPrice: undefined,
    maxPrice: undefined,
    sort: "newest",
    page: 1,
  }

  return Response.json({ query: parsed, original: q })
}

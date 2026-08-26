import type { NextRequest } from "next/server"

import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { parseSearchQuery } from "@/lib/search-parse"
import type { ParseResponse } from "@/lib/types"

/**
 * POST /api/search/parse
 *
 * Natural language in, filter state out. The client sends the sentence a
 * shopper typed and gets back a ListingQuery to put in the URL, plus the
 * lower-confidence readings to offer as tappable chips.
 *
 * This is not a chat endpoint. There is no history and no follow-up: one call
 * converts one phrase into filters, the user lands on /browse, and from there
 * they correct us by tapping a chip rather than by typing again.
 *
 * Body: { q: string }
 * Returns: ParseResponse — see lib/types.ts
 *
 * Example: "bag under 3000 birr" -> { category: "fashion", maxPrice: 3000 }
 *
 * It always answers 200, including when rate limited or when the parse fails.
 * components/search-field.tsx drops the response on any non-2xx, so an error
 * status here reads to the shopper as "search is broken" — the degraded answer
 * is a plain keyword query, not a status code.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const q: string = typeof body?.q === "string" ? body.q : ""

  const allowed = await checkRateLimit(`parse:ip:${getClientIp(request)}`, 30, 60)
  if (!allowed) {
    const limited: ParseResponse = {
      query: q.trim() ? { q: q.trim() } : {},
      original: q,
      confidence: {},
      suggestions: [],
      source: "none",
    }
    return Response.json(limited)
  }

  const parsed = await parseSearchQuery(q)
  return Response.json(parsed satisfies ParseResponse)
}

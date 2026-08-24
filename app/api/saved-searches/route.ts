import type { NextRequest } from "next/server"
import { and, eq, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { savedSearches } from "@/db/schema"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import type { ListingCondition, ListingQuery, ListingTier } from "@/lib/types"

const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]
const TIERS: ListingTier[] = ["indexed", "claimed", "native"]
const MAX_SAVED_SEARCHES = 25
const MAX_TEXT = 120
const PRICE_CEILING = 100_000_000

function boundedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, MAX_TEXT) : undefined
}

function boundedPrice(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  if (rounded < 0 || rounded > PRICE_CEILING) return undefined
  return rounded
}

/**
 * Rebuild the query from scratch rather than trusting the body.
 *
 * This lands in a jsonb column that the ingestion worker reads back and turns
 * into a WHERE clause against every incoming listing. Anything unrecognised in
 * here is either a typo that silently stops the alert from ever firing or a
 * field the matcher was not expecting, so only known keys survive and each is
 * range-checked on the way in.
 */
function sanitiseQuery(raw: unknown): ListingQuery {
  const input = (raw ?? {}) as Record<string, unknown>
  const query: ListingQuery = {}

  const q = boundedText(input.q)
  if (q) query.q = q
  const category = boundedText(input.category)
  if (category) query.category = category
  const area = boundedText(input.area)
  if (area) query.area = area

  const minPrice = boundedPrice(input.minPrice)
  if (minPrice !== undefined) query.minPrice = minPrice
  const maxPrice = boundedPrice(input.maxPrice)
  if (maxPrice !== undefined) query.maxPrice = maxPrice

  const conditions = Array.isArray(input.condition)
    ? input.condition.filter((c): c is ListingCondition =>
        CONDITIONS.includes(c as ListingCondition)
      )
    : []
  if (conditions.length) query.condition = conditions

  const tiers = Array.isArray(input.tier)
    ? input.tier.filter((t): t is ListingTier => TIERS.includes(t as ListingTier))
    : []
  if (tiers.length) query.tier = tiers

  return query
}

/**
 * POST /api/saved-searches
 *
 * "Notify me when a Samsung A54 under 15,000 appears." The feature only this
 * architecture can deliver: Jiji can alert on Jiji's own stock, and we are
 * watching every channel they are not.
 *
 * The phrase is parsed client-side by the same code the search box uses, so what
 * arrives here is already a ListingQuery -- category, keyword, price ceiling --
 * rather than a string somebody would later have to match with LIKE. That is
 * what lets an alert for "iPhone 12" fire on an Amharic post about the same
 * phone.
 *
 * The ingestion pipeline checks active saved searches against every incoming
 * listing and sends a Telegram ping within minutes of a match.
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to save an alert." },
        { status: 401 }
      )
    }
    throw error
  }

  const allowed = await checkRateLimit(`saved-search:${user.id}`, 20, 3600)
  if (!allowed) {
    return Response.json(
      { error: "That's a lot of alerts at once. Try again in an hour." },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const query = sanitiseQuery(body?.query)

  // An empty query matches every listing in the index, which would turn an
  // alert into a firehose the moment ingestion resumes.
  if (Object.keys(query).length === 0) {
    return Response.json(
      { error: "Say what to watch for — a keyword, a category or a price." },
      { status: 400 }
    )
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(savedSearches)
    .where(eq(savedSearches.userId, user.id))

  if (Number(count) >= MAX_SAVED_SEARCHES) {
    return Response.json(
      { error: `At most ${MAX_SAVED_SEARCHES} alerts per account.` },
      { status: 409 }
    )
  }

  // Saving the same alert twice should be a no-op rather than two pings per
  // match. jsonb equality compares by value, so key order does not matter.
  const [existing] = await db
    .select({ id: savedSearches.id })
    .from(savedSearches)
    .where(
      and(
        eq(savedSearches.userId, user.id),
        sql`${savedSearches.query} = ${JSON.stringify(query)}::jsonb`
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(savedSearches)
      .set({ alertsOn: true, updatedAt: new Date() })
      .where(eq(savedSearches.id, existing.id))

    return Response.json({ id: existing.id, query, alertsOn: true }, { status: 200 })
  }

  const [saved] = await db
    .insert(savedSearches)
    .values({ userId: user.id, query, alertsOn: true })
    .returning({
      id: savedSearches.id,
      createdAt: savedSearches.createdAt,
    })

  return Response.json(
    {
      id: saved.id,
      query,
      alertsOn: true,
      createdAt: saved.createdAt.toISOString(),
    },
    { status: 201 }
  )
}

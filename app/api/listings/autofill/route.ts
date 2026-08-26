import type { NextRequest } from "next/server"
import { asc } from "drizzle-orm"

import { db } from "@/db/client"
import { categories } from "@/db/schema"
import { suggestPrice } from "@/lib/comparables"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { getObjectBytes, ownsMediaKey } from "@/lib/storage"
import type { AutofillResponse, ListingCondition } from "@/lib/types"
import { MAX_VISION_PHOTOS, analyzePhotos, type VisionPhoto } from "@/lib/vision"

const FALLBACK: AutofillResponse = { ok: false }

function mimeFromKey(key: string): string {
  if (key.endsWith(".png")) return "image/png"
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg"
  return "image/webp"
}

/**
 * POST /api/listings/autofill
 *
 * Photos in, draft listing fields out. Two deliberate design points:
 *
 * 1. Failure returns `{ ok: false }` with HTTP 200, not an error status. The
 *    client's job on failure is to open a plain form quietly — a 5xx would
 *    trip error handling and log noise for what is a designed, expected path.
 * 2. The price never comes from the model. It's computed from comparable live
 *    listings in lib/comparables.ts, so the number is auditable.
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in." }, { status: 401 })
    }
    throw error
  }

  const body = await request.json().catch(() => null)
  const keys: string[] = Array.isArray(body?.images)
    ? body.images.filter((key: unknown): key is string => typeof key === "string")
    : []

  const owned = keys.filter((key) => ownsMediaKey(key, user.id))
  if (!owned.length) return Response.json(FALLBACK)

  // Vision costs real money per call, and this is the only paid path a signed-in
  // user can trigger directly.
  const allowed = await checkRateLimit(`autofill:${user.id}`, 15, 3600)
  if (!allowed) return Response.json(FALLBACK)

  const bytes = await Promise.all(
    owned.slice(0, MAX_VISION_PHOTOS).map((key) => getObjectBytes(key))
  )
  const photos: VisionPhoto[] = bytes.flatMap((buffer, index) =>
    buffer
      ? [{ mimeType: mimeFromKey(owned[index]), base64: buffer.toString("base64") }]
      : []
  )
  if (!photos.length) return Response.json(FALLBACK)

  const categoryRows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.slug))

  const result = await analyzePhotos(
    photos,
    categoryRows.map((row) => row.slug)
  )
  if (!result) return Response.json(FALLBACK)

  const price = result.fields.categorySlug
    ? await suggestPrice(
        result.fields.categorySlug,
        (result.fields.condition || null) as ListingCondition | null
      )
    : null

  return Response.json({
    ok: true,
    fields: result.fields,
    conditionReasoning: result.conditionReasoning,
    confidence: result.confidence,
    price,
  } satisfies AutofillResponse)
}

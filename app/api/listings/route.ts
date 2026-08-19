import crypto from "node:crypto"
import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { categories, images as imagesTable, listings } from "@/db/schema"
import type { ListingCondition, ListingsPage } from "@/lib/types"
import { getListings, parseListingQuery } from "@/lib/listings"
import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { MAX_UPLOAD_FILES, ownsMediaKey } from "@/lib/storage"
import { slugify } from "@/lib/utils"

const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]
const MAX_TITLE_LENGTH = 140
const MAX_DESCRIPTION_LENGTH = 2000

/** Trim to a hard ceiling, or null when the field is absent/blank. */
function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

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
 * Creates a new native listing (direct post by a signed-in user).
 * Trust routing (see README §Routing): established accounts publish
 * immediately; new/flagged accounts publish as `queued`, pending moderator
 * review. `images` carries r2 keys already uploaded via
 * POST /api/uploads/presign; ownership is re-verified here.
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to post a listing." },
        { status: 401 }
      )
    }
    throw error
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.titleEn !== "string" || !body.titleEn.trim()) {
    return Response.json({ error: "titleEn is required." }, { status: 400 })
  }

  const allowed = await checkRateLimit(`post-listing:${user.id}`, 10, 3600)
  if (!allowed) {
    return Response.json(
      { error: "You've posted a lot today. Try again in an hour." },
      { status: 429 }
    )
  }

  if (typeof body.categorySlug !== "string") {
    return Response.json({ error: "categorySlug is required." }, { status: 400 })
  }

  const [category] = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(eq(categories.slug, body.categorySlug))
    .limit(1)
  if (!category) {
    return Response.json({ error: "Unknown categorySlug." }, { status: 400 })
  }

  const condition = CONDITIONS.includes(body.condition) ? body.condition : undefined
  if (!condition) {
    return Response.json(
      { error: `condition must be one of ${CONDITIONS.join(", ")}` },
      { status: 400 }
    )
  }

  const priceEtb =
    typeof body.priceEtb === "number" && Number.isFinite(body.priceEtb)
      ? Math.round(body.priceEtb)
      : null
  const negotiable = Boolean(body.negotiable)
  const locationArea = typeof body.locationArea === "string" ? body.locationArea : null
  const locationCity =
    typeof body.locationCity === "string" ? body.locationCity : "Addis Ababa"
  // Image keys arrive from POST /api/uploads/presign, which namespaces them by
  // user id. Re-check that here — otherwise a caller could attach photos that
  // belong to somebody else's listing.
  const submittedKeys: string[] = Array.isArray(body.images)
    ? body.images.filter((key: unknown): key is string => typeof key === "string")
    : []
  if (submittedKeys.length > MAX_UPLOAD_FILES) {
    return Response.json(
      { error: `At most ${MAX_UPLOAD_FILES} photos per listing.` },
      { status: 400 }
    )
  }
  if (submittedKeys.some((key) => !ownsMediaKey(key, user.id))) {
    return Response.json({ error: "Unknown image key." }, { status: 400 })
  }
  const imageKeys = submittedKeys

  const status = user.trustLevel === "established" ? "live" : "queued"
  const slug = `${slugify(body.titleEn)}-${crypto.randomUUID().slice(0, 8)}`

  const [listing] = await db
    .insert(listings)
    .values({
      slug,
      titleEn: body.titleEn.trim().slice(0, MAX_TITLE_LENGTH),
      titleAm: boundedText(body.titleAm, MAX_TITLE_LENGTH),
      descriptionEn: boundedText(body.descriptionEn, MAX_DESCRIPTION_LENGTH),
      descriptionAm: boundedText(body.descriptionAm, MAX_DESCRIPTION_LENGTH),
      priceEtb,
      negotiable,
      categorySlug: category.slug,
      condition,
      locationArea,
      locationCity,
      tier: "native",
      status,
      sellerId: user.id,
      seenInChannels: 1,
      postedAt: new Date(),
    })
    .returning()

  if (imageKeys.length) {
    await db.insert(imagesTable).values(
      imageKeys.map((r2Key, index) => ({ listingId: listing.id, r2Key, sortOrder: index }))
    )
  }

  return Response.json(
    {
      id: listing.id,
      slug: listing.slug,
      status: listing.status,
      message:
        status === "live"
          ? "Listing published."
          : "Listing received and queued for review.",
    },
    { status: 201 }
  )
}

import crypto from "node:crypto"
import type { NextRequest } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/db/client"
import { categories, images as imagesTable, listings } from "@/db/schema"
import type { ListingCondition, ListingsPage } from "@/lib/types"
import { getListings, parseListingQuery } from "@/lib/listings"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import { slugify } from "@/lib/utils"

const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]

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
 * review — image upload and a posting UI are a separate ticket, this just
 * accepts already-uploaded r2 keys in `images`.
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
  const imageKeys: string[] = Array.isArray(body.images)
    ? body.images.filter((key: unknown): key is string => typeof key === "string")
    : []

  const status = user.trustLevel === "established" ? "live" : "queued"
  const slug = `${slugify(body.titleEn)}-${crypto.randomUUID().slice(0, 8)}`

  const [listing] = await db
    .insert(listings)
    .values({
      slug,
      titleEn: body.titleEn.trim(),
      titleAm: typeof body.titleAm === "string" ? body.titleAm : null,
      descriptionEn: typeof body.descriptionEn === "string" ? body.descriptionEn : null,
      descriptionAm: typeof body.descriptionAm === "string" ? body.descriptionAm : null,
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

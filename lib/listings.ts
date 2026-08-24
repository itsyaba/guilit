import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm"

import { db } from "@/db/client"
import {
  categories,
  channels,
  extractions,
  images as imagesTable,
  listingSources,
  listings,
  rawMessages,
  ratings,
  users,
} from "@/db/schema"
import { getImageUrl } from "@/lib/media"
import { areaAliases } from "@/lib/search-lexicon"
import { isUuid } from "@/lib/utils"
import type {
  AreaOption,
  CategoryOption,
  ConditionOption,
  FilterOptions,
  Listing,
  ListingCondition,
  ListingImage,
  ListingQuery,
  ListingSeller,
  ListingSource,
  ListingTier,
  ListingsPage,
  SortValue,
  TierOption,
} from "@/lib/types"

/**
 * The single seam between the UI and its data — see lib/types.ts.
 *
 * `app/browse/page.tsx` and `app/listing/[id]/page.tsx` call these exports
 * directly, and `app/api/listings*` routes just wrap the same functions, so
 * this module is the one place real Postgres queries live.
 */

export const PAGE_SIZE = 24

const PRICE_BOUNDS_MAX = 150000 // Vehicles sit an order of magnitude above everything else.

const CONDITION_OPTIONS: ConditionOption[] = [
  { value: "brand_new", label: "Brand New", labelAm: "አዲስ" },
  { value: "lightly_used", label: "Lightly Used", labelAm: "ትንሽ የተሰራበት" },
  { value: "fair", label: "Fair Condition", labelAm: "መካከለኛ" },
]

const TIER_OPTIONS: TierOption[] = [
  { value: "indexed", label: "Indexed", labelAm: "የተሰበሰበ" },
  { value: "claimed", label: "Claimed", labelAm: "የተረጋገጠ" },
  { value: "native", label: "On Gulit", labelAm: "በጉሊት የተለጠፈ" },
]

const CONDITION_VALUES: ListingCondition[] = CONDITION_OPTIONS.map((c) => c.value)
const TIER_VALUES: ListingTier[] = TIER_OPTIONS.map((t) => t.value)

// --------------------------------------------------------------------------
// Filter options
// --------------------------------------------------------------------------

export async function getFilterOptions(): Promise<FilterOptions> {
  const [categoryRows, areaRows, channelRow] = await Promise.all([
    db
      .select({ slug: categories.slug, nameEn: categories.nameEn, nameAm: categories.nameAm })
      .from(categories),
    db
      .selectDistinct({ area: listings.locationArea, areaAm: listings.locationAreaAm })
      .from(listings)
      .where(and(eq(listings.status, "live"), isNotNull(listings.locationArea))),
    db.select({ count: sql<number>`count(*)` }).from(channels).where(eq(channels.active, true)),
  ])

  const categoryOptions: CategoryOption[] = categoryRows.map((c) => ({
    slug: c.slug,
    label: c.nameEn,
    labelAm: c.nameAm,
  }))

  const areaOptions: AreaOption[] = areaRows
    .filter((a): a is { area: string; areaAm: string | null } => a.area !== null)
    .map((a) => ({ area: a.area, areaAm: a.areaAm ?? a.area }))

  return {
    categories: categoryOptions,
    conditions: CONDITION_OPTIONS,
    tiers: TIER_OPTIONS,
    areas: areaOptions,
    priceBoundsEtb: { min: 0, max: PRICE_BOUNDS_MAX },
    channelCount: Number(channelRow[0]?.count ?? 0),
  }
}

// --------------------------------------------------------------------------
// Cursor pagination
// --------------------------------------------------------------------------

type SortDirection = "asc" | "desc"

const SORT_DIRECTION: Record<SortValue, SortDirection> = {
  newest: "desc",
  price_asc: "asc",
  price_desc: "desc",
  channels: "desc",
}

function sortColumn(sort: SortValue) {
  switch (sort) {
    case "price_asc":
    case "price_desc":
      return listings.priceEtb
    case "channels":
      return listings.seenInChannels
    case "newest":
    default:
      return listings.postedAt
  }
}

type Cursor = { dir: "next" | "prev"; v: string | number; id: string }

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    if (
      (parsed.dir === "next" || parsed.dir === "prev") &&
      typeof parsed.id === "string" &&
      (typeof parsed.v === "string" || typeof parsed.v === "number")
    ) {
      return parsed as Cursor
    }
    return null
  } catch {
    return null
  }
}

/**
 * Boundary value for a row, in the shape a cursor stores it. `postedAt` is
 * carried as Postgres's own text output (microsecond precision) rather than
 * a JS Date — Date only has millisecond resolution, and round-tripping a
 * truncated value back into a tuple comparison made a boundary row satisfy
 * `>` against its own (truncated) value, duplicating it across pages.
 */
function boundaryValue(
  sort: SortValue,
  row: { postedAtText: string; priceEtb: number | null; seenInChannels: number }
) {
  if (sort === "price_asc" || sort === "price_desc") return row.priceEtb as number
  if (sort === "channels") return row.seenInChannels
  return row.postedAtText
}

// --------------------------------------------------------------------------
// Query building
// --------------------------------------------------------------------------

function buildFilterConditions(query: ListingQuery) {
  const conditions = [eq(listings.status, "live")]

  if (query.q) {
    conditions.push(
      sql`${listings.searchVector} @@ websearch_to_tsquery('simple', ${query.q})`
    )
  }
  if (query.category) conditions.push(eq(listings.categorySlug, query.category))
  if (query.condition?.length) conditions.push(inArray(listings.condition, query.condition))
  if (query.tier?.length) conditions.push(inArray(listings.tier, query.tier))
  // Match every spelling of the area, not just the canonical one. Extraction
  // now normalises to English names, but real channel traffic writes "ቦሌ" and
  // "Bole" interchangeably and a filter that only matched one would silently
  // hide half the listings in a neighbourhood.
  if (query.area) conditions.push(inArray(listings.locationArea, areaAliases(query.area)))

  const sort = query.sort ?? "newest"
  const needsPrice =
    query.minPrice !== undefined || query.maxPrice !== undefined || sort === "price_asc" || sort === "price_desc"
  if (needsPrice) {
    conditions.push(isNotNull(listings.priceEtb))
    if (query.minPrice !== undefined) conditions.push(gte(listings.priceEtb, query.minPrice))
    if (query.maxPrice !== undefined && query.maxPrice < PRICE_BOUNDS_MAX) {
      conditions.push(lte(listings.priceEtb, query.maxPrice))
    }
  }

  return conditions
}

export async function getListings(query: ListingQuery = {}): Promise<ListingsPage> {
  const sort = query.sort ?? "newest"
  const primaryDir = SORT_DIRECTION[sort]
  const col = sortColumn(sort)
  const filters = buildFilterConditions(query)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(listings)
    .where(and(...filters))

  const pageCount = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE))
  const displayPage = Math.min(Math.max(1, query.page ?? 1), pageCount)

  const cursor = decodeCursor(query.cursor)
  const direction: "forward" | "backward" = cursor === null || cursor.dir === "next" ? "forward" : "backward"
  const effectiveDir: SortDirection =
    direction === "forward" ? primaryDir : primaryDir === "desc" ? "asc" : "desc"

  const seekConditions = [...filters]
  if (cursor) {
    const operator = effectiveDir === "desc" ? sql`<` : sql`>`
    seekConditions.push(sql`(${col}, ${listings.id}) ${operator} (${cursor.v}, ${cursor.id})`)
  }

  const orderFns = effectiveDir === "desc" ? [desc(col), desc(listings.id)] : [asc(col), asc(listings.id)]

  const rows = await db
    .select({
      id: listings.id,
      postedAtText: sql<string>`${listings.postedAt}::text`,
      priceEtb: listings.priceEtb,
      seenInChannels: listings.seenInChannels,
    })
    .from(listings)
    .where(and(...seekConditions))
    .orderBy(...orderFns)
    .limit(PAGE_SIZE + 1)

  const hasMore = rows.length > PAGE_SIZE
  let windowRows = rows.slice(0, PAGE_SIZE)
  if (direction === "backward") windowRows = windowRows.reverse()

  const hasNext = direction === "forward" ? hasMore : true
  const hasPrev = direction === "forward" ? cursor !== null : hasMore

  const nextCursor =
    hasNext && windowRows.length
      ? encodeCursor({
          dir: "next",
          v: boundaryValue(sort, windowRows[windowRows.length - 1]),
          id: windowRows[windowRows.length - 1].id,
        })
      : null
  const prevCursor =
    hasPrev && windowRows.length
      ? encodeCursor({ dir: "prev", v: boundaryValue(sort, windowRows[0]), id: windowRows[0].id })
      : null

  const [items, [{ channelCount }]] = await Promise.all([
    buildListingsByIds(windowRows.map((r) => r.id)),
    db.select({ channelCount: sql<number>`count(*)` }).from(channels).where(eq(channels.active, true)),
  ])

  return {
    items,
    total: Number(total),
    page: displayPage,
    pageCount,
    pageSize: PAGE_SIZE,
    channelCount: Number(channelCount),
    nextCursor,
    prevCursor,
  }
}

export async function getListing(id: string): Promise<Listing | null> {
  // Postgres throws on a malformed uuid literal — a bad/typo'd id should be
  // a 404, not a 500.
  if (!isUuid(id)) return null
  const [listing] = await buildListingsByIds([id])
  return listing ?? null
}

export async function getListingIds(): Promise<string[]> {
  const rows = await db.select({ id: listings.id }).from(listings).where(eq(listings.status, "live"))
  return rows.map((r) => r.id)
}

/**
 * Live, priced listings that actually have a photograph, newest first.
 *
 * The front page leads with stock rather than with a claim, and a grid of
 * hatched no-photo boxes is not stock -- it reads as a broken deploy. So the
 * showcase narrows to rows with an image and says so in its own subheading,
 * rather than pulling the newest rows and hoping.
 *
 * That narrowing is a real editorial choice and it costs freshness: the newest
 * photographed row can be older than the newest row. The credibility band
 * states the capture age a screen above this, so the two never disagree.
 */
export async function getShowcaseListings(limit = 10): Promise<Listing[]> {
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.status, "live"),
        isNotNull(listings.priceEtb),
        sql`exists (select 1 from ${imagesTable} where ${imagesTable.listingId} = ${listings.id})`
      )
    )
    .orderBy(desc(listings.postedAt), desc(listings.id))
    .limit(limit)

  return buildListingsByIds(rows.map((r) => r.id))
}

/** Same category, different listing. Used for the "more like this" rail. */
export async function getRelatedListings(listing: Listing, limit = 4): Promise<Listing[]> {
  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.status, "live"),
        eq(listings.categorySlug, listing.categorySlug),
        sql`${listings.id} != ${listing.id}`
      )
    )
    .orderBy(desc(listings.postedAt))
    .limit(limit)

  return buildListingsByIds(rows.map((r) => r.id))
}

// --------------------------------------------------------------------------
// Row assembly — batched joins for a set of listing ids, order-preserving
// --------------------------------------------------------------------------

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone
  return `${phone.slice(0, 4)}${"*".repeat(Math.max(phone.length - 6, 3))}${phone.slice(-2)}`
}

async function buildListingsByIds(ids: string[]): Promise<Listing[]> {
  if (ids.length === 0) return []

  const [baseRows, imageRows, sourceRows] = await Promise.all([
    db
      .select({
        id: listings.id,
        slug: listings.slug,
        titleEn: listings.titleEn,
        titleAm: listings.titleAm,
        descriptionEn: listings.descriptionEn,
        descriptionAm: listings.descriptionAm,
        priceEtb: listings.priceEtb,
        lowestPriceEtb: listings.lowestPriceEtb,
        negotiable: listings.negotiable,
        categorySlug: listings.categorySlug,
        categoryNameEn: categories.nameEn,
        categoryNameAm: categories.nameAm,
        condition: listings.condition,
        locationArea: listings.locationArea,
        locationAreaAm: listings.locationAreaAm,
        locationCity: listings.locationCity,
        tier: listings.tier,
        status: listings.status,
        sellerId: listings.sellerId,
        extractionConfidence: listings.extractionConfidence,
        seenInChannels: listings.seenInChannels,
        postedAt: listings.postedAt,
        updatedAt: listings.updatedAt,
      })
      .from(listings)
      .leftJoin(categories, eq(listings.categorySlug, categories.slug))
      .where(inArray(listings.id, ids)),
    db
      .select({
        listingId: imagesTable.listingId,
        r2Key: imagesTable.r2Key,
        width: imagesTable.width,
        height: imagesTable.height,
        sortOrder: imagesTable.sortOrder,
      })
      .from(imagesTable)
      .where(inArray(imagesTable.listingId, ids))
      .orderBy(asc(imagesTable.sortOrder)),
    db
      .select({
        listingId: listingSources.listingId,
        priceEtb: listingSources.priceEtb,
        postedAt: rawMessages.postedAt,
        messageId: rawMessages.messageId,
        channelUsername: channels.username,
        channelTitle: channels.title,
      })
      .from(listingSources)
      .innerJoin(rawMessages, eq(listingSources.rawMessageId, rawMessages.id))
      .innerJoin(channels, eq(rawMessages.channelId, channels.id))
      .where(inArray(listingSources.listingId, ids)),
  ])

  const sellerIds = [...new Set(baseRows.map((r) => r.sellerId).filter((v): v is string => v !== null))]
  const unclaimedIds = baseRows.filter((r) => r.sellerId === null).map((r) => r.id)

  const [sellerRows, ratingRows, extractedPhoneRows] = await Promise.all([
    sellerIds.length
      ? db.select().from(users).where(inArray(users.id, sellerIds))
      : Promise.resolve([]),
    sellerIds.length
      ? db
          .select({
            sellerId: ratings.sellerId,
            avg: sql<number | null>`avg(${ratings.score})`,
            count: sql<number>`count(*)`,
          })
          .from(ratings)
          .where(inArray(ratings.sellerId, sellerIds))
          .groupBy(ratings.sellerId)
      : Promise.resolve([]),
    // Indexed, unclaimed listings have no seller row yet — the phone "already
    // in the listing" that a buyer can still call comes straight from the
    // extraction pipeline, same source the claim flow reads from.
    unclaimedIds.length
      ? db
          .select({
            listingId: listingSources.listingId,
            phone: extractions.phoneNormalized,
            confidence: extractions.confidenceScore,
          })
          .from(listingSources)
          .innerJoin(rawMessages, eq(listingSources.rawMessageId, rawMessages.id))
          .innerJoin(extractions, eq(extractions.rawMessageId, rawMessages.id))
          .where(
            and(
              inArray(listingSources.listingId, unclaimedIds),
              isNotNull(extractions.phoneNormalized)
            )
          )
      : Promise.resolve([]),
  ])

  const sellerById = new Map(sellerRows.map((s) => [s.id, s]))
  const ratingBySeller = new Map(ratingRows.map((r) => [r.sellerId, r]))

  const extractedPhoneByListing = new Map<string, string>()
  const extractedPhoneConfidence = new Map<string, number>()
  for (const row of extractedPhoneRows) {
    if (!row.phone) continue
    const bestSoFar = extractedPhoneConfidence.get(row.listingId) ?? -1
    if (row.confidence > bestSoFar) {
      extractedPhoneByListing.set(row.listingId, row.phone)
      extractedPhoneConfidence.set(row.listingId, row.confidence)
    }
  }
  const imagesByListing = new Map<string, ListingImage[]>()
  const sourcesByListing = new Map<string, ListingSource[]>()

  for (const row of imageRows) {
    const list = imagesByListing.get(row.listingId) ?? []
    list.push({
      url: getImageUrl(row.r2Key),
      width: row.width ?? 0,
      height: row.height ?? 0,
      alt: "",
    })
    imagesByListing.set(row.listingId, list)
  }
  for (const row of sourceRows) {
    const list = sourcesByListing.get(row.listingId) ?? []
    list.push({
      channelHandle: row.channelUsername,
      channelTitle: row.channelTitle,
      messageUrl: `https://t.me/${row.channelUsername}/${row.messageId}`,
      postedAt: row.postedAt.toISOString(),
      priceEtb: row.priceEtb,
    })
    sourcesByListing.set(row.listingId, list)
  }

  const byId = new Map<string, Listing>()
  for (const row of baseRows) {
    const sellerRow: ListingSeller = row.sellerId
      ? (() => {
          const u = sellerById.get(row.sellerId!)
          const rating = ratingBySeller.get(row.sellerId!)
          return {
            displayName: u?.username ?? null,
            telegramHandle: u?.username ?? null,
            phone: u?.phone ?? null,
            phoneMasked: u?.phone ? maskPhone(u.phone) : null,
            phoneVerified: u?.phoneVerified ?? false,
            ratingAvg: rating?.avg !== null && rating?.avg !== undefined ? Number(rating.avg) : null,
            ratingCount: rating ? Number(rating.count) : null,
            memberSince: u?.createdAt?.toISOString() ?? null,
          }
        })()
      : (() => {
          const phone = extractedPhoneByListing.get(row.id) ?? null
          return {
            displayName: null,
            telegramHandle: null,
            phone,
            phoneMasked: phone ? maskPhone(phone) : null,
            phoneVerified: false,
            ratingAvg: null,
            ratingCount: null,
            memberSince: null,
          }
        })()

    /**
     * A listing awaiting moderation is reachable by direct link — the seller
     * can share it the moment they post — but its contact routes stay closed
     * until a moderator clears it. Stripped here rather than in the UI so the
     * phone number never reaches the client at all.
     */
    const seller: ListingSeller =
      row.status === "live"
        ? sellerRow
        : { ...sellerRow, phone: null, phoneMasked: null, telegramHandle: null }

    const title = row.titleEn
    const images = (imagesByListing.get(row.id) ?? []).map((img, index) => ({
      ...img,
      alt: `${title}, photo ${index + 1}`,
    }))

    byId.set(row.id, {
      id: row.id,
      slug: row.slug,
      title,
      titleAm: row.titleAm,
      description: row.descriptionEn ?? "",
      descriptionAm: row.descriptionAm,
      priceEtb: row.priceEtb,
      currency: "ETB",
      negotiable: row.negotiable,
      categorySlug: row.categorySlug ?? "",
      categoryLabel: row.categoryNameEn ?? "",
      categoryLabelAm: row.categoryNameAm ?? "",
      status: row.status,
      condition: row.condition,
      location: {
        area: row.locationArea ?? "",
        areaAm: row.locationAreaAm ?? row.locationArea ?? "",
        city: row.locationCity ?? "Addis Ababa",
      },
      tier: row.tier,
      images,
      seller,
      sources: sourcesByListing.get(row.id) ?? [],
      seenInChannels: row.seenInChannels,
      lowestPriceEtb: row.lowestPriceEtb,
      extractionConfidence: row.extractionConfidence ?? 0,
      postedAt: row.postedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  }

  return ids.map((id) => byId.get(id)).filter((l): l is Listing => l !== undefined)
}

// --------------------------------------------------------------------------
// Search param plumbing
// --------------------------------------------------------------------------

export type RawSearchParams = Record<string, string | string[] | undefined>

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return (Array.isArray(value) ? value : [value]).filter(Boolean)
}

function toNumber(value: string | string[] | undefined): number | undefined {
  const single = Array.isArray(value) ? value[0] : value
  if (!single) return undefined
  const parsed = Number(single)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseListingQuery(params: RawSearchParams): ListingQuery {
  const singleOf = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const sortParam = singleOf("sort")
  const sort = (["newest", "price_asc", "price_desc", "channels"] as const).find(
    (value) => value === sortParam
  )

  return {
    q: singleOf("q") || undefined,
    category: singleOf("category") || undefined,
    area: singleOf("area") || undefined,
    condition: toArray(params.condition).filter((value): value is ListingCondition =>
      CONDITION_VALUES.includes(value as ListingCondition)
    ),
    tier: toArray(params.tier).filter((value): value is ListingTier =>
      TIER_VALUES.includes(value as ListingTier)
    ),
    minPrice: toNumber(params.minPrice),
    maxPrice: toNumber(params.maxPrice),
    sort,
    page: toNumber(params.page),
    cursor: singleOf("cursor") || undefined,
  }
}

/** Rebuilds a query string with one or more keys replaced. */
export function buildSearchParams(
  params: RawSearchParams,
  overrides: Record<string, string | string[] | undefined>
): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (key in overrides) continue
    for (const item of toArray(value)) search.append(key, item)
  }
  for (const [key, value] of Object.entries(overrides)) {
    for (const item of toArray(value)) search.append(key, item)
  }

  const query = search.toString()
  return query ? `?${query}` : ""
}

/** How many filters are currently narrowing the results. Drives the mobile badge. */
export function countActiveFilters(query: ListingQuery): number {
  return [
    query.category,
    query.area,
    query.condition?.length ? "condition" : undefined,
    query.tier?.length ? "tier" : undefined,
    query.minPrice ? "minPrice" : undefined,
    query.maxPrice !== undefined && query.maxPrice < PRICE_BOUNDS_MAX ? "maxPrice" : undefined,
  ].filter(Boolean).length
}

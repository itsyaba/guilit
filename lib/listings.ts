import fixtures from "@/fixtures/listings.json"
import type {
  AreaOption,
  CategoryOption,
  ConditionOption,
  FilterOptions,
  Listing,
  ListingCondition,
  ListingQuery,
  ListingTier,
  ListingsPage,
  SortValue,
  TierOption,
} from "@/lib/types"
import { SORT_OPTIONS } from "@/lib/types"

/**
 * The single seam between the UI and its data.
 *
 * Every function here is async and returns plain serialisable objects, so the
 * day `/api/listings` exists this module changes and nothing else does. The
 * matching below is deliberately naive -- real search is Postgres FTS plus
 * pg_trgm and belongs to the search ticket, not to the page shells.
 */

type FixtureFile = {
  categories: CategoryOption[]
  conditions: ConditionOption[]
  tiers: TierOption[]
  areas: AreaOption[]
  channelCount: number
  listings: Listing[]
}

const data = fixtures as unknown as FixtureFile

export const PAGE_SIZE = 24

const prices = data.listings
  .map((listing) => listing.priceEtb)
  .filter((price): price is number => price !== null)

const PRICE_BOUNDS = {
  min: 0,
  // Vehicles sit an order of magnitude above everything else, so the slider is
  // capped below them and the top stop reads as "and above".
  max: 150000,
  absoluteMax: Math.max(...prices),
}

export async function getFilterOptions(): Promise<FilterOptions> {
  return {
    categories: data.categories,
    conditions: data.conditions,
    tiers: data.tiers,
    areas: data.areas,
    priceBoundsEtb: { min: PRICE_BOUNDS.min, max: PRICE_BOUNDS.max },
    channelCount: data.channelCount,
  }
}

function matchesQuery(listing: Listing, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    listing.title,
    listing.titleAm ?? "",
    listing.categoryLabel,
    listing.categoryLabelAm,
    listing.location.area,
    listing.location.areaAm,
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(needle)
}

function sortListings(items: Listing[], sort: SortValue): Listing[] {
  const sorted = [...items]
  switch (sort) {
    case "price_asc":
      return sorted.sort(
        (a, b) => (a.priceEtb ?? Infinity) - (b.priceEtb ?? Infinity)
      )
    case "price_desc":
      return sorted.sort((a, b) => (b.priceEtb ?? -1) - (a.priceEtb ?? -1))
    case "channels":
      return sorted.sort((a, b) => b.seenInChannels - a.seenInChannels)
    case "newest":
    default:
      return sorted.sort(
        (a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)
      )
  }
}

export async function getListings(
  query: ListingQuery = {}
): Promise<ListingsPage> {
  const sort = query.sort ?? "newest"

  const filtered = data.listings.filter((listing) => {
    if (query.q && !matchesQuery(listing, query.q)) return false
    if (query.category && listing.categorySlug !== query.category) return false
    if (query.condition?.length && !query.condition.includes(listing.condition))
      return false
    if (query.tier?.length && !query.tier.includes(listing.tier)) return false
    if (query.area && listing.location.area !== query.area) return false

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      // A listing with no price is not evidence that it falls outside the
      // range, but a price filter is an explicit ask for priced items.
      if (listing.priceEtb === null) return false
      if (query.minPrice !== undefined && listing.priceEtb < query.minPrice)
        return false
      if (
        query.maxPrice !== undefined &&
        query.maxPrice < PRICE_BOUNDS.max &&
        listing.priceEtb > query.maxPrice
      )
        return false
    }

    return true
  })

  const sorted = sortListings(filtered, sort)
  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount)
  const start = (page - 1) * PAGE_SIZE

  return {
    items: sorted.slice(start, start + PAGE_SIZE),
    total,
    page,
    pageCount,
    pageSize: PAGE_SIZE,
    channelCount: data.channelCount,
  }
}

export async function getListing(id: string): Promise<Listing | null> {
  return data.listings.find((listing) => listing.id === id) ?? null
}

export async function getListingIds(): Promise<string[]> {
  return data.listings.map((listing) => listing.id)
}

/** Same category, different listing. Used for the "more like this" rail. */
export async function getRelatedListings(
  listing: Listing,
  limit = 4
): Promise<Listing[]> {
  return data.listings
    .filter(
      (candidate) =>
        candidate.id !== listing.id &&
        candidate.categorySlug === listing.categorySlug
    )
    .slice(0, limit)
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

const CONDITION_VALUES: ListingCondition[] = [
  "brand_new",
  "lightly_used",
  "fair",
]
const TIER_VALUES: ListingTier[] = ["indexed", "claimed", "native"]

export function parseListingQuery(params: RawSearchParams): ListingQuery {
  const sortParam = Array.isArray(params.sort) ? params.sort[0] : params.sort
  const sort = SORT_OPTIONS.find((option) => option.value === sortParam)?.value

  const singleOf = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

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
    query.maxPrice !== undefined && query.maxPrice < PRICE_BOUNDS.max
      ? "maxPrice"
      : undefined,
  ].filter(Boolean).length
}

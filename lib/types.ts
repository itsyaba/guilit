/**
 * Shape of a listing as the UI consumes it.
 *
 * This mirrors `fixtures/listings.json` today and is intended to mirror the
 * `/api/listings` response tomorrow. Components import from here, never from
 * the fixture file, so swapping the data source touches one module.
 */

export type ListingTier = "indexed" | "claimed" | "native"

export type ListingCondition = "brand_new" | "lightly_used" | "fair"

export type PriceVerdict = "below" | "fair" | "above" | "suspicious" | "unknown"

export type ListingImage = {
  url: string
  width: number
  height: number
  alt: string
}

export type ListingSource = {
  channelHandle: string
  channelTitle: string
  messageUrl: string
  postedAt: string
  priceEtb: number | null
}

export type ListingSeller = {
  displayName: string | null
  telegramHandle: string | null
  phoneMasked: string | null
  phoneVerified: boolean
  ratingAvg: number | null
  ratingCount: number | null
  memberSince: string | null
}

export type ListingPriceStats = {
  categoryMedianEtb: number
  p25Etb: number
  p75Etb: number
  verdict: PriceVerdict
  sampleSize: number
}

export type Listing = {
  id: string
  slug: string
  title: string
  titleAm: string | null
  description: string
  descriptionAm: string | null
  priceEtb: number | null
  currency: string
  negotiable: boolean
  categorySlug: string
  categoryLabel: string
  categoryLabelAm: string
  condition: ListingCondition
  location: { area: string; areaAm: string; city: string }
  tier: ListingTier
  images: ListingImage[]
  seller: ListingSeller
  sources: ListingSource[]
  seenInChannels: number
  lowestPriceEtb: number | null
  priceStats: ListingPriceStats | null
  extractionConfidence: number
  postedAt: string
  updatedAt: string
}

export type CategoryOption = { slug: string; label: string; labelAm: string }
export type ConditionOption = {
  value: ListingCondition
  label: string
  labelAm: string
}
export type TierOption = { value: ListingTier; label: string; labelAm: string }
export type AreaOption = { area: string; areaAm: string }

export type FilterOptions = {
  categories: CategoryOption[]
  conditions: ConditionOption[]
  tiers: TierOption[]
  areas: AreaOption[]
  priceBoundsEtb: { min: number; max: number }
  channelCount: number
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "channels", label: "Seen in most channels" },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]["value"]

export type ListingQuery = {
  q?: string
  category?: string
  condition?: ListingCondition[]
  tier?: ListingTier[]
  area?: string
  minPrice?: number
  maxPrice?: number
  sort?: SortValue
  page?: number
}

export type ListingsPage = {
  items: Listing[]
  total: number
  page: number
  pageCount: number
  pageSize: number
  channelCount: number
}

import { cache } from "react"
import { and, asc, desc, eq, gt, sql } from "drizzle-orm"

import { db } from "@/db/client"
import {
  categories,
  channels,
  extractions,
  jobs,
  listingSources,
  listings,
  priceStats,
  rawMessages,
} from "@/db/schema"

import { getShowcaseListings } from "@/lib/listings"
import type { Listing, ListingCondition } from "@/lib/types"

/**
 * Data behind the landing page.
 *
 * The front page makes one claim -- the market is already on Telegram and we
 * collapse its cross-posts into one row each -- so it reads that claim out of
 * Postgres rather than hard-coding a number into the copy. If the figure looks
 * small on a given day, the fix is more channels, not a bigger font.
 *
 * Everything the page needs comes back from one `getLandingPayload()` behind
 * React's `cache()`, awaited once in the route and passed down as props. The
 * previous shape had each band running its own query, which meant two separate
 * `getLandingStats()` round-trips for the hero and the band directly under it,
 * both rendering the same numbers.
 */

export type LandingStats = {
  liveListings: number
  channelCount: number
  /** Source posts behind those listings: one per channel that carried the item. */
  sightings: number
  /** Posts a shopper never has to scroll past, because dedup already ate them. */
  collapsed: number
  /**
   * When we last pulled a message off Telegram -- `raw_messages.created_at`,
   * not `posted_at`.
   *
   * This distinction is the whole point of the figure. `posted_at` is when the
   * seller wrote to their channel, which tells a visitor nothing about whether
   * our listener is alive; a dead pipeline and a quiet market look identical
   * through it. This is our own clock, so "4 minutes ago" means we are running
   * and "2 days ago" means we are not.
   */
  lastCapturedAt: string | null
  /** Captured posts still waiting for the dedup worker. Non-zero means backlog. */
  pendingDedup: number
}

export type LandingSighting = {
  channelHandle: string
  channelTitle: string
  messageId: number
  /** The post as it was written. Amharic, English, or both in one line. */
  rawText: string | null
  postedAt: string
  priceEtb: number | null
  /** The number exactly as this post typed it, for marking inside rawText. */
  phoneRaw: string | null
}

/**
 * One real dedup cluster, shown on the front page as the proof.
 *
 * Null when the index holds nothing cross-posted yet -- a fresh database, or a
 * day when every item happened to be posted once. The page shows the
 * single-source state instead of inventing a cluster.
 */
export type LandingCluster = {
  id: string
  title: string
  categoryLabel: string
  area: string | null
  seenInChannels: number
  distinctChannels: number
  priceEtb: number | null
  lowestPriceEtb: number | null
  highestPriceEtb: number | null
  /** The one number all the sightings normalise to. The dedup key, visible. */
  phoneNormalized: string | null
  sightings: LandingSighting[]
}

export type LandingCategory = {
  slug: string
  label: string
  labelAm: string
  liveListings: number
}

export type LandingPriceBucket = {
  categoryLabel: string
  condition: ListingCondition
  sampleSize: number
  medianEtb: number
  p25Etb: number
  p75Etb: number
}

export type LandingPayload = {
  stats: LandingStats
  categories: LandingCategory[]
  cluster: LandingCluster | null
  bucket: LandingPriceBucket | null
  showcase: Listing[]
}

async function getLandingCategories(): Promise<LandingCategory[]> {
  const rows = await db
    .select({
      slug: categories.slug,
      label: categories.nameEn,
      labelAm: categories.nameAm,
      liveListings: sql<number>`count(${listings.id})`,
    })
    .from(categories)
    .leftJoin(
      listings,
      and(
        eq(listings.categorySlug, categories.slug),
        eq(listings.status, "live")
      )
    )
    .groupBy(categories.slug, categories.nameEn, categories.nameAm)
    .orderBy(desc(sql`count(${listings.id})`))

  // An empty category is a link to an empty grid. Leave it out until it fills.
  return rows
    .map((row) => ({ ...row, liveListings: Number(row.liveListings) }))
    .filter((row) => row.liveListings > 0)
}

async function getLandingStats(): Promise<LandingStats> {
  const [[totals], [channelRow], [captureRow], [dedupRow]] = await Promise.all([
    db
      .select({
        liveListings: sql<number>`count(*)`,
        sightings: sql<number>`coalesce(sum(${listings.seenInChannels}), 0)`,
      })
      .from(listings)
      .where(eq(listings.status, "live")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(channels)
      .where(eq(channels.active, true)),
    db
      .select({
        lastCapturedAt: sql<string | null>`max(${rawMessages.createdAt})::text`,
      })
      .from(rawMessages),
    db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(and(eq(jobs.type, "dedup"), eq(jobs.status, "pending"))),
  ])

  const liveListings = Number(totals?.liveListings ?? 0)
  const sightings = Number(totals?.sightings ?? 0)

  return {
    liveListings,
    channelCount: Number(channelRow?.count ?? 0),
    sightings,
    collapsed: Math.max(sightings - liveListings, 0),
    lastCapturedAt: captureRow?.lastCapturedAt ?? null,
    pendingDedup: Number(dedupRow?.count ?? 0),
  }
}

/**
 * The most cross-posted live listing, with every post behind it.
 *
 * This returns the raw message text, which the previous version deliberately
 * withheld as too long to read. It is back because the text is the argument:
 * four posts saying the same thing in two different Amharic phrasings, one
 * mixed-script line and one full English sentence, all carrying one phone
 * number, is a demonstration that dedup is hard and that we do it. Four channel
 * names and four prices alone could be four different sofas.
 *
 * One line of each post is enough. The section truncates rather than wraps.
 */
async function getLandingCluster(): Promise<LandingCluster | null> {
  const [row] = await db
    .select({
      id: listings.id,
      titleEn: listings.titleEn,
      titleAm: listings.titleAm,
      categoryLabel: categories.nameEn,
      area: listings.locationArea,
      seenInChannels: listings.seenInChannels,
      priceEtb: listings.priceEtb,
      lowestPriceEtb: listings.lowestPriceEtb,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categorySlug, categories.slug))
    .where(and(eq(listings.status, "live"), gt(listings.seenInChannels, 1)))
    .orderBy(desc(listings.seenInChannels), desc(listings.postedAt))
    .limit(1)

  if (!row) return null

  const sightingRows = await db
    .select({
      channelHandle: channels.username,
      channelTitle: channels.title,
      messageId: rawMessages.messageId,
      rawText: rawMessages.rawText,
      postedAt: sql<string>`${rawMessages.postedAt}::text`,
      priceEtb: listingSources.priceEtb,
      phoneRaw: extractions.phoneRaw,
      phoneNormalized: extractions.phoneNormalized,
    })
    .from(listingSources)
    .innerJoin(rawMessages, eq(listingSources.rawMessageId, rawMessages.id))
    .innerJoin(channels, eq(rawMessages.channelId, channels.id))
    // Left, not inner: a post whose extraction row is missing still belongs in
    // the cluster. It just cannot contribute the phone mark.
    .leftJoin(extractions, eq(extractions.rawMessageId, rawMessages.id))
    .where(eq(listingSources.listingId, row.id))
    // Cheapest first: reading down the list should feel like reading down a
    // price list, with the number you should be paying at the top.
    .orderBy(asc(listingSources.priceEtb), asc(rawMessages.postedAt))

  // A cluster we cannot show the sources for is not proof of anything.
  if (sightingRows.length < 2) return null

  const prices = sightingRows
    .map((sighting) => sighting.priceEtb)
    .filter((price): price is number => price !== null)

  return {
    id: row.id,
    // The seller's own words, Amharic when they wrote in Amharic.
    title: row.titleAm ?? row.titleEn,
    categoryLabel: row.categoryLabel ?? "Listing",
    area: row.area,
    seenInChannels: row.seenInChannels,
    distinctChannels: new Set(sightingRows.map((s) => s.channelHandle)).size,
    priceEtb: row.priceEtb,
    lowestPriceEtb:
      row.lowestPriceEtb ?? (prices.length ? Math.min(...prices) : null),
    highestPriceEtb: prices.length ? Math.max(...prices) : null,
    phoneNormalized:
      sightingRows.find((s) => s.phoneNormalized)?.phoneNormalized ?? null,
    sightings: sightingRows.map(({ phoneNormalized: _ignored, ...rest }) => rest),
  }
}

/**
 * The busiest comparison bucket in the price table.
 *
 * price_stats holds a median and a middle-half range per category and
 * condition, rebuilt on a schedule. The front page quotes whichever bucket has
 * the most sales behind it, because a range computed from six listings is not
 * a range, and saying so out loud is the only honest way to show the feature.
 */
async function getLandingPriceBucket(): Promise<LandingPriceBucket | null> {
  const [row] = await db
    .select({
      categoryLabel: categories.nameEn,
      condition: priceStats.condition,
      sampleSize: priceStats.sampleSize,
      medianEtb: priceStats.medianEtb,
      p25Etb: priceStats.p25Etb,
      p75Etb: priceStats.p75Etb,
    })
    .from(priceStats)
    .leftJoin(categories, eq(priceStats.categorySlug, categories.slug))
    .where(eq(priceStats.scope, "category+condition"))
    .orderBy(desc(priceStats.sampleSize))
    .limit(1)

  if (!row?.condition || row.medianEtb === null) return null

  return {
    categoryLabel: row.categoryLabel ?? "Listings",
    condition: row.condition,
    sampleSize: row.sampleSize,
    medianEtb: row.medianEtb,
    p25Etb: row.p25Etb ?? row.medianEtb,
    p75Etb: row.p75Etb ?? row.medianEtb,
  }
}

/**
 * Everything the front page renders, in one pass.
 *
 * `cache()` dedupes within a request, so a section that needs the stats twice
 * costs one query, and the route can await this once and pass props down rather
 * than having ten server components each open their own connection.
 *
 * Deliberately not wrapped in a try/catch. A failed query here should reach
 * app/error.tsx rather than render a front page quietly claiming zero listings,
 * which is indistinguishable from a fresh deploy and much worse than an error.
 */
export const getLandingPayload = cache(async (): Promise<LandingPayload> => {
  const [stats, categoryRows, cluster, bucket, showcase] = await Promise.all([
    getLandingStats(),
    getLandingCategories(),
    getLandingCluster(),
    getLandingPriceBucket(),
    getShowcaseListings(6),
  ])

  return { stats, categories: categoryRows, cluster, bucket, showcase }
})

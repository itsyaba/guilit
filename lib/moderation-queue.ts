import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db/client"
import {
  categories,
  channels,
  extractions,
  images as imagesTable,
  listingSources,
  listings,
  rawMessages,
  users,
} from "@/db/schema"
import { getImageUrl } from "@/lib/media"
import { MODERATION_MIN_SAMPLE } from "@/lib/price-stats-config"
import { getQueueReason } from "@/lib/moderation"
import type { AdminQueueItem } from "@/lib/types"

/**
 * The moderation queue, read once for both GET /api/admin/queue and the server
 * component that renders /admin/queue. Both used to carry their own copy of
 * this query, which is how native posts ended up visible in neither.
 *
 * Two origins, two queries:
 *
 *  - scraped: listing → listing_sources → raw_messages → extractions → channels.
 *    All inner joins, because a scraped item without an extraction isn't
 *    reviewable. Ordered by confidence so the worst extractions surface first.
 *  - native: a listing posted through /post by an account whose trust level
 *    doesn't earn instant publish. There is no channel, no raw message and no
 *    extraction — the review surface is the seller's own photos and fields.
 *
 * Native items sort first: a seller is sitting there waiting on a human, where
 * a scraped listing is not waiting on anything.
 */

const LIMIT = 50

/** Same sub-selects both branches need, expressed once. */
const reportCountSql = sql<number>`(SELECT COUNT(*) FROM reports WHERE reports.listing_id = ${listings.id})::int`
/**
 * Median and low fence for this listing's category bucket, read from the
 * materialised price_stats table.
 *
 * This used to be a percentile_cont over the whole listings table, evaluated
 * once per queue row — up to fifty full scans per page load, on both the API
 * and the admin server component. It is now an index lookup against a table of
 * a few hundred rows, and more importantly it is the *same* number the buyer
 * sees on the listing page, so the queue and the price check cannot disagree.
 *
 * Walks the same widening ladder as the buyer-facing price check, most
 * specific rung first, so a moderator and a shopper are judging one listing
 * against the same comparison set rather than two different ones.
 */
/** Canonical search term for this listing, matched the same way the price-stats
 *  refresh does — longest synonym wins, canonical term breaks the tie. */
const termForListingSql = sql<string | null>`(
  SELECT s.canonical_term FROM search_synonyms s
   WHERE s.category_slug = ${listings.categorySlug}
     AND lower(coalesce(${listings.titleEn}, '') || ' ' || coalesce(${listings.titleAm}, ''))
         LIKE '%' || lower(s.synonym) || '%'
   ORDER BY length(s.synonym) DESC, s.canonical_term
   LIMIT 1
)`

function bucketStatSql(column: "median_etb" | "low_fence_etb") {
  return sql<number | null>`(
    SELECT ps.${sql.raw(column)} FROM price_stats ps
     WHERE ps.bucket_key IN (
             'term:' || ${termForListingSql} || '|cond:' || ${listings.condition}::text,
             'term:' || ${termForListingSql} || '|cond:*',
             'cat:' || ${listings.categorySlug} || '|cond:' || ${listings.condition}::text,
             'cat:' || ${listings.categorySlug} || '|cond:*'
           )
       AND ps.sample_size >= ${MODERATION_MIN_SAMPLE}
     ORDER BY CASE ps.scope
                WHEN 'term+condition' THEN 0
                WHEN 'term' THEN 1
                WHEN 'category+condition' THEN 2
                ELSE 3
              END
     LIMIT 1
  )`
}

const categoryMedianSql = bucketStatSql("median_etb")
const priceLowFenceSql = bucketStatSql("low_fence_etb")

async function scrapedItems(): Promise<AdminQueueItem[]> {
  const rows = await db
    .select({
      listingId: listings.id,
      slug: listings.slug,
      titleEn: listings.titleEn,
      titleAm: listings.titleAm,
      priceEtb: listings.priceEtb,
      categorySlug: listings.categorySlug,
      categoryLabel: categories.nameEn,
      confidenceScore: extractions.confidenceScore,
      seenInChannels: listings.seenInChannels,
      queuedAt: listings.updatedAt,
      rawMessageId: rawMessages.id,
      channelId: channels.id,
      channelUsername: channels.username,
      channelTitle: channels.title,
      messageId: rawMessages.messageId,
      rawText: rawMessages.rawText,
      mediaRefs: rawMessages.mediaRefs,
      postedAt: rawMessages.postedAt,
      extractionTitleEn: extractions.titleEn,
      extractionTitleAm: extractions.titleAm,
      extractionDescEn: extractions.descriptionEn,
      extractionDescAm: extractions.descriptionAm,
      extractionPriceEtb: extractions.priceEtb,
      extractionCategorySlug: extractions.categorySlug,
      extractionCondition: extractions.condition,
      extractionLocationArea: extractions.locationArea,
      extractionLocationCity: extractions.locationCity,
      extractionPhoneRaw: extractions.phoneRaw,
      extractionPhoneNormalized: extractions.phoneNormalized,
      reportCount: reportCountSql,
      categoryMedian: categoryMedianSql,
      priceLowFence: priceLowFenceSql,
      hasFlaggedPhone: sql<boolean>`COALESCE((SELECT TRUE FROM extractions e2 INNER JOIN listing_sources ls2 ON ls2.raw_message_id = e2.raw_message_id INNER JOIN listings l2 ON l2.id = ls2.listing_id WHERE e2.phone_normalized = ${extractions.phoneNormalized} AND ${extractions.phoneNormalized} IS NOT NULL AND l2.status = 'removed' LIMIT 1), FALSE)`,
    })
    .from(listings)
    .innerJoin(listingSources, eq(listingSources.listingId, listings.id))
    .innerJoin(rawMessages, eq(rawMessages.id, listingSources.rawMessageId))
    .innerJoin(extractions, eq(extractions.rawMessageId, rawMessages.id))
    .innerJoin(channels, eq(channels.id, rawMessages.channelId))
    .leftJoin(categories, eq(categories.slug, listings.categorySlug))
    .where(eq(listings.status, "queued"))
    .orderBy(asc(extractions.confidenceScore), asc(listings.id))
    // A listing seen in several channels joins to one row per source; take the
    // lowest-confidence row for each and over-fetch so dedup can't starve.
    .limit(LIMIT + 1)

  const byListing = new Map<string, (typeof rows)[0]>()
  for (const row of rows) {
    if (!byListing.has(row.listingId)) byListing.set(row.listingId, row)
  }

  return Array.from(byListing.values())
    .slice(0, LIMIT)
    .map((r) => ({
      listingId: r.listingId,
      slug: r.slug,
      source: "scraped" as const,
      titleEn: r.titleEn,
      titleAm: r.titleAm,
      priceEtb: r.priceEtb,
      categorySlug: r.categorySlug,
      categoryLabel: r.categoryLabel,
      confidenceScore: r.confidenceScore ?? 0,
      seenInChannels: r.seenInChannels ?? 1,
      queuedAt: r.queuedAt?.toISOString() ?? new Date().toISOString(),
      queueReason:
        getQueueReason({
          confidenceScore: r.confidenceScore ?? 0,
          priceEtb: r.priceEtb,
          categoryMedianEtb: r.categoryMedian,
          priceLowFenceEtb: r.priceLowFence,
          phoneNormalized: r.extractionPhoneNormalized,
          hasFlaggedPhone: r.hasFlaggedPhone,
          reportCount: r.reportCount,
          seenInChannels: r.seenInChannels ?? 1,
        }) ?? "low_confidence",
      reportCount: r.reportCount,
      images: [],
      seller: null,
      rawMessage: {
        id: r.rawMessageId,
        channelId: r.channelId,
        channelUsername: r.channelUsername ?? "",
        messageId: r.messageId,
        rawText: r.rawText,
        mediaRefs: r.mediaRefs ?? [],
        postedAt: r.postedAt?.toISOString() ?? new Date().toISOString(),
      },
      extraction: {
        titleEn: r.extractionTitleEn,
        titleAm: r.extractionTitleAm,
        descriptionEn: r.extractionDescEn,
        descriptionAm: r.extractionDescAm,
        priceEtb: r.extractionPriceEtb,
        currency: "ETB",
        categorySlug: r.extractionCategorySlug ?? "",
        categoryLabel: r.categoryLabel ?? "",
        condition: r.extractionCondition ?? "fair",
        locationArea: r.extractionLocationArea ?? "",
        locationCity: r.extractionLocationCity ?? "",
        phoneRaw: r.extractionPhoneRaw,
        phoneNormalized: r.extractionPhoneNormalized,
        confidenceScore: r.confidenceScore ?? 0,
      },
      channel: {
        id: r.channelId,
        username: r.channelUsername ?? "",
        title: r.channelTitle ?? "",
      },
    }))
}

async function nativeItems(): Promise<AdminQueueItem[]> {
  const rows = await db
    .select({
      listingId: listings.id,
      slug: listings.slug,
      titleEn: listings.titleEn,
      titleAm: listings.titleAm,
      descriptionEn: listings.descriptionEn,
      descriptionAm: listings.descriptionAm,
      priceEtb: listings.priceEtb,
      condition: listings.condition,
      locationArea: listings.locationArea,
      locationCity: listings.locationCity,
      categorySlug: listings.categorySlug,
      categoryLabel: categories.nameEn,
      queuedAt: listings.updatedAt,
      sellerId: users.id,
      sellerUsername: users.username,
      sellerPhone: users.phone,
      sellerPhoneVerified: users.phoneVerified,
      sellerTrustLevel: users.trustLevel,
      sellerCreatedAt: users.createdAt,
      reportCount: reportCountSql,
      categoryMedian: categoryMedianSql,
      priceLowFence: priceLowFenceSql,
    })
    .from(listings)
    .leftJoin(categories, eq(categories.slug, listings.categorySlug))
    .leftJoin(users, eq(users.id, listings.sellerId))
    .where(and(eq(listings.status, "queued"), eq(listings.tier, "native")))
    .orderBy(asc(listings.updatedAt), asc(listings.id))
    .limit(LIMIT)

  if (!rows.length) return []

  const imageRows = await db
    .select({ listingId: imagesTable.listingId, r2Key: imagesTable.r2Key })
    .from(imagesTable)
    .where(
      inArray(
        imagesTable.listingId,
        rows.map((r) => r.listingId)
      )
    )
    .orderBy(asc(imagesTable.sortOrder))

  const imagesByListing = new Map<string, string[]>()
  for (const row of imageRows) {
    const list = imagesByListing.get(row.listingId) ?? []
    list.push(getImageUrl(row.r2Key))
    imagesByListing.set(row.listingId, list)
  }

  return rows.map((r) => {
    // Confidence 1 skips the extraction-confidence rule, which can't apply to a
    // human-typed listing; the price and report rules still do. Anything that
    // matches nothing is here purely because the seller is new.
    const reason =
      getQueueReason({
        confidenceScore: 1,
        priceEtb: r.priceEtb,
        categoryMedianEtb: r.categoryMedian,
        priceLowFenceEtb: r.priceLowFence,
        phoneNormalized: r.sellerPhone,
        hasFlaggedPhone: r.sellerTrustLevel === "flagged",
        reportCount: r.reportCount,
        seenInChannels: 1,
      }) ?? "new_seller"

    return {
      listingId: r.listingId,
      slug: r.slug,
      source: "native" as const,
      titleEn: r.titleEn,
      titleAm: r.titleAm,
      priceEtb: r.priceEtb,
      categorySlug: r.categorySlug,
      categoryLabel: r.categoryLabel,
      confidenceScore: 0,
      seenInChannels: 1,
      queuedAt: r.queuedAt?.toISOString() ?? new Date().toISOString(),
      queueReason: reason,
      reportCount: r.reportCount,
      images: imagesByListing.get(r.listingId) ?? [],
      seller: r.sellerId
        ? {
            id: r.sellerId,
            username: r.sellerUsername,
            phone: r.sellerPhone,
            phoneVerified: r.sellerPhoneVerified ?? false,
            trustLevel: r.sellerTrustLevel ?? "new",
            memberSince: r.sellerCreatedAt?.toISOString() ?? null,
          }
        : null,
      rawMessage: null,
      // The seller's own fields, mapped into the same shape the edit form
      // already reads, so the moderator UI needs no second code path for it.
      extraction: {
        titleEn: r.titleEn,
        titleAm: r.titleAm,
        descriptionEn: r.descriptionEn,
        descriptionAm: r.descriptionAm,
        priceEtb: r.priceEtb,
        currency: "ETB",
        categorySlug: r.categorySlug ?? "",
        categoryLabel: r.categoryLabel ?? "",
        condition: r.condition ?? "fair",
        locationArea: r.locationArea ?? "",
        locationCity: r.locationCity ?? "",
        phoneRaw: r.sellerPhone,
        phoneNormalized: r.sellerPhone,
        confidenceScore: 0,
      },
      channel: null,
    }
  })
}

export async function getModerationQueue(): Promise<AdminQueueItem[]> {
  const [native, scraped] = await Promise.all([nativeItems(), scrapedItems()])
  return [...native, ...scraped].slice(0, LIMIT)
}

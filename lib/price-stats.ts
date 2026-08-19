import { inArray, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { priceStats } from "@/db/schema"
import type { PriceStatsRow } from "@/db/types"
import { MIN_SAMPLE, TRIM_MIN_SAMPLE, classifyPrice } from "@/lib/price-stats-config"
import type {
  ListingCondition,
  PriceContextBasis,
  PriceContextResponse,
} from "@/lib/types"

/**
 * Materialised median and IQR per comparison bucket.
 *
 * This replaced three separate copies of the same percentile_cont aggregate —
 * one running on every browse grid render, one in the posting flow, one as a
 * correlated subquery per moderation queue row — each with its own sample-size
 * rule. They disagreed. Now they read the same row.
 *
 * See db/schema/price-stats.ts for the bucket key format and why it is a single
 * text column, and lib/price-stats-config.ts for the thresholds.
 */

/** How stale the table may get before a read triggers a refresh. */
export const PRICE_STATS_TTL_SECONDS = Number(
  process.env.PRICE_STATS_TTL_SECONDS ?? 900
)

/**
 * Maps a listing to a canonical search term by its title.
 *
 * Longest synonym wins so "washing machine" beats "machine", with the canonical
 * term as a deterministic tie-break — the refresh and the per-listing read must
 * agree on the answer, so this expression exists once and is used by both.
 *
 * The synonym's own category must match the listing's. Without that guard a
 * motorcycle jacket matches "ሞተር ሳይክል" and gets priced against motorcycles, and
 * a blood-pressure monitor matches "monitor" and gets priced against computer
 * displays. Both were flagged as scams before this line existed.
 */
export const TERM_MATCH_SQL = sql`(
  SELECT s.canonical_term
    FROM search_synonyms s
   WHERE s.category_slug = l.category_slug
     AND lower(coalesce(l.title_en, '') || ' ' || coalesce(l.title_am, ''))
         LIKE '%' || lower(s.synonym) || '%'
   ORDER BY length(s.synonym) DESC, s.canonical_term
   LIMIT 1
)`

/**
 * Rebuilds every bucket from the live corpus.
 *
 * DELETE + INSERT inside one transaction rather than an upsert: under MVCC a
 * reader sees either the whole old snapshot or the whole new one, buckets that
 * fell to zero live rows disappear instead of lingering stale, and there is no
 * reaping pass to get wrong. At a few hundred buckets the cost is irrelevant.
 *
 * The advisory lock makes concurrent refreshes a no-op rather than a pile-up:
 * the scheduler and a lazy read can both fire at once on a cold start.
 */
const REFRESH_SQL = sql`
WITH live AS (
  SELECT l.id, l.category_slug, l.condition, l.price_etb, ${TERM_MATCH_SQL} AS term
    FROM listings l
   WHERE l.status = 'live' AND l.price_etb IS NOT NULL AND l.price_etb > 0
),
exploded AS (
  SELECT 'cat:' || category_slug || '|cond:' || condition::text AS bucket_key,
         'category+condition' AS scope, category_slug, condition, NULL::text AS term, price_etb
    FROM live WHERE category_slug IS NOT NULL AND condition IS NOT NULL
  UNION ALL
  SELECT 'cat:' || category_slug || '|cond:*',
         'category', category_slug, NULL::condition, NULL::text, price_etb
    FROM live WHERE category_slug IS NOT NULL
  UNION ALL
  SELECT 'term:' || term || '|cond:' || condition::text,
         'term+condition', NULL::text, condition, term, price_etb
    FROM live WHERE term IS NOT NULL AND condition IS NOT NULL
  UNION ALL
  SELECT 'term:' || term || '|cond:*',
         'term', NULL::text, NULL::condition, term, price_etb
    FROM live WHERE term IS NOT NULL
),
raw AS (
  SELECT bucket_key, count(*) AS n,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY price_etb) AS p25,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY price_etb) AS p75
    FROM exploded GROUP BY bucket_key
),
kept AS (
  -- Trim only once the quartiles are worth trusting. Below TRIM_MIN_SAMPLE the
  -- fence is so tight it ejects genuine variance rather than genuine errors.
  SELECT e.* FROM exploded e JOIN raw r USING (bucket_key)
   WHERE r.n < ${TRIM_MIN_SAMPLE}
      OR e.price_etb BETWEEN r.p25 - 3 * (r.p75 - r.p25)
                         AND r.p75 + 3 * (r.p75 - r.p25)
),
agg AS (
  SELECT k.bucket_key,
         min(k.scope) AS scope,
         min(k.category_slug) AS category_slug,
         min(k.condition::text)::condition AS condition,
         min(k.term) AS term,
         r.n AS raw_n,
         count(*) AS n,
         percentile_cont(0.25) WITHIN GROUP (ORDER BY k.price_etb) AS p25,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY k.price_etb) AS p50,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY k.price_etb) AS p75,
         min(k.price_etb) AS lo,
         max(k.price_etb) AS hi,
         -- Fences in log space: used prices are roughly log-normal, and a
         -- linear p25 - 1.5*IQR goes negative on every bucket we have, which
         -- makes it useless as the low-side signal.
         percentile_cont(0.25) WITHIN GROUP (ORDER BY ln(k.price_etb)) AS l25,
         percentile_cont(0.75) WITHIN GROUP (ORDER BY ln(k.price_etb)) AS l75
    FROM kept k JOIN raw r USING (bucket_key)
   GROUP BY k.bucket_key, r.n
)
INSERT INTO price_stats (
  bucket_key, scope, category_slug, condition, term,
  raw_sample_size, sample_size, trimmed_count,
  median_etb, p25_etb, p75_etb, min_etb, max_etb,
  low_fence_etb, high_fence_etb, computed_at
)
SELECT bucket_key, scope, category_slug, condition, term,
       raw_n, count, raw_n - count,
       round(p50)::int, round(p25)::int, round(p75)::int, lo, hi,
       greatest(1, round(exp(l25 - 1.5 * (l75 - l25))))::int,
       round(exp(l75 + 1.5 * (l75 - l25)))::int,
       now()
  FROM (SELECT *, n AS count FROM agg) a
`

export type RefreshResult = { buckets: number; skipped: boolean }

export async function refreshPriceStats(): Promise<RefreshResult> {
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('price_stats_refresh')) AS locked`
    )
    if (!lock?.locked) return { buckets: 0, skipped: true }

    await tx.execute(sql`DELETE FROM price_stats`)
    await tx.execute(REFRESH_SQL)
    const [row] = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM price_stats`
    )
    return { buckets: Number(row?.n ?? 0), skipped: false }
  })
}

/**
 * Refreshes only when the table is older than the TTL.
 *
 * Call this from route handlers, never from a server component render — a
 * prerender must not trigger a database write.
 */
export async function ensureFreshPriceStats(
  ttlSeconds = PRICE_STATS_TTL_SECONDS
): Promise<void> {
  const [row] = await db.execute<{ stale: boolean }>(
    sql`SELECT coalesce(max(computed_at) < now() - make_interval(secs => ${ttlSeconds}), true) AS stale
          FROM price_stats`
  )
  if (row?.stale) await refreshPriceStats().catch(() => undefined)
}

/* -- Reading --------------------------------------------------------------- */

export function bucketKeyFor(
  scope: "cat" | "term",
  value: string,
  condition: ListingCondition | null
): string {
  return `${scope}:${value}|cond:${condition ?? "*"}`
}

/**
 * The widening ladder, most specific first. A bucket only counts if it clears
 * `minSample`; otherwise we fall to the next rung, and returning nothing at all
 * is a valid outcome.
 */
export function bucketLadder(
  categorySlug: string | null,
  condition: ListingCondition | null,
  term: string | null
): string[] {
  const keys: string[] = []
  if (term && condition) keys.push(bucketKeyFor("term", term, condition))
  if (term) keys.push(bucketKeyFor("term", term, null))
  if (categorySlug && condition) keys.push(bucketKeyFor("cat", categorySlug, condition))
  if (categorySlug) keys.push(bucketKeyFor("cat", categorySlug, null))
  return keys
}

export async function getPriceStatsByKeys(
  keys: string[]
): Promise<Map<string, PriceStatsRow>> {
  if (!keys.length) return new Map()
  const rows = await db
    .select()
    .from(priceStats)
    .where(inArray(priceStats.bucketKey, keys))
  return new Map(rows.map((r) => [r.bucketKey, r]))
}

export const SCOPE_TO_BASIS: Record<string, PriceContextBasis> = {
  "term+condition": "term+condition",
  term: "term",
  "category+condition": "category+condition",
  category: "category",
}

/**
 * First rung of the ladder with enough comparables, or null.
 *
 * A listing whose condition is unknown skips the condition-specific rungs
 * entirely rather than being counted as any particular condition.
 */
export async function resolveBucket(args: {
  categorySlug: string | null
  condition: ListingCondition | null
  term?: string | null
  minSample: number
}): Promise<PriceStatsRow | null> {
  const keys = bucketLadder(args.categorySlug, args.condition, args.term ?? null)
  if (!keys.length) return null
  const found = await getPriceStatsByKeys(keys)
  for (const key of keys) {
    const row = found.get(key)
    if (row && row.sampleSize >= args.minSample) return row
  }
  return null
}

/* -- Per-listing context --------------------------------------------------- */

const CONDITION_PHRASE: Record<ListingCondition, string> = {
  brand_new: "brand new",
  lightly_used: "lightly used",
  fair: "fair condition",
}

/**
 * Names the comparison set in words a buyer can check, e.g. "lightly used
 * iPhone" or "Phones & Tablets". The point of the range is that it is
 * auditable; an unlabelled band is just a number with a chart around it.
 */
function bucketLabel(
  row: PriceStatsRow,
  categoryLabel: string | null
): string {
  const condition = row.condition ? `${CONDITION_PHRASE[row.condition]} ` : ""
  if (row.term) {
    const term = row.term.replace(/_/g, " ")
    return `${condition}${term}`
  }
  return `${condition}${categoryLabel ?? row.categorySlug ?? "listings"}`.trim()
}

/**
 * The typical range for one listing, plus where it sits in it.
 *
 * Returns a discriminated "not available" rather than throwing or inventing a
 * range: below MIN_SAMPLE comparables we say nothing, because a confident-
 * looking band drawn from four listings is worse than no band at all.
 */
export async function getPriceContext(
  listingId: string
): Promise<PriceContextResponse | null> {
  const [listing] = await db.execute<{
    id: string
    price_etb: number | null
    category_slug: string | null
    condition: ListingCondition | null
    category_label: string | null
    term: string | null
  }>(sql`
    SELECT l.id,
           l.price_etb,
           l.category_slug,
           l.condition,
           c.name_en AS category_label,
           ${TERM_MATCH_SQL} AS term
      FROM listings l
      LEFT JOIN categories c ON c.slug = l.category_slug
     WHERE l.id = ${listingId} AND l.status <> 'removed'
     LIMIT 1
  `)

  if (!listing) return null
  if (listing.price_etb === null) {
    return { available: false, reason: "no_price" }
  }
  if (!listing.category_slug && !listing.term) {
    return { available: false, reason: "no_category" }
  }

  const row = await resolveBucket({
    categorySlug: listing.category_slug,
    condition: listing.condition,
    term: listing.term,
    minSample: MIN_SAMPLE,
  })
  if (!row) return { available: false, reason: "insufficient_sample" }

  const price = Number(listing.price_etb)
  const { verdict, outlier } = classifyPrice(price, row)

  return {
    available: true,
    context: {
      listingId: listing.id,
      priceEtb: price,
      basis: SCOPE_TO_BASIS[row.scope] ?? "category",
      bucketLabel: bucketLabel(row, listing.category_label),
      categorySlug: listing.category_slug,
      condition: listing.condition,
      sampleSize: row.sampleSize,
      medianEtb: row.medianEtb,
      p25Etb: row.p25Etb,
      p75Etb: row.p75Etb,
      lowFenceEtb: row.lowFenceEtb,
      highFenceEtb: row.highFenceEtb,
      verdict,
      outlier,
      deltaFromMedianPct: Math.round(
        ((price - row.medianEtb) / row.medianEtb) * 100
      ),
      computedAt: row.computedAt.toISOString(),
    },
  }
}

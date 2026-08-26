import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"

import { conditionEnum } from "./enums"

/**
 * price_stats — materialised median + IQR per comparison bucket.
 *
 * Before this table the same percentile_cont aggregate lived in three places
 * (the browse row assembly, the posting-flow suggestion, and the moderation
 * queue), each with its own sample-size rule, so the three surfaces could and
 * did disagree about what a category's median was. They now all read a row from
 * here, which means a buyer and a moderator are looking at the same number.
 *
 * Refreshed by lib/price-stats.ts as one DELETE + INSERT inside a transaction:
 * atomic for readers under MVCC, and buckets that fall to zero live rows
 * disappear rather than lingering stale.
 *
 * `bucket_key` is a single text primary key rather than a composite over
 * (category_slug, condition) because the buckets are heterogeneous — some are
 * keyed on a category, some on a canonical search term, and `condition` is
 * meaningfully NULL for "any condition". One string key makes the read a
 * PK lookup with `WHERE bucket_key = ANY($1)`, which is exactly the shape the
 * widening ladder wants: fetch all four candidate rungs in one round trip.
 *
 * Key format, and the ladder order (most specific first):
 *   term:iphone|cond:lightly_used     a brand/model, one condition
 *   term:iphone|cond:*                a brand/model, any condition
 *   cat:phones|cond:lightly_used      a category, one condition
 *   cat:phones|cond:*                 a category, any condition
 *
 * Every bucket is stored regardless of sample size. The table is raw material;
 * the minimum is policy, and the consumers deliberately apply different ones —
 * see MIN_SAMPLE vs MODERATION_MIN_SAMPLE in lib/price-stats-config.ts.
 */
export const priceStats = pgTable(
  "price_stats",
  {
    bucketKey: text("bucket_key").primaryKey(),

    /** "term+condition" | "term" | "category+condition" | "category". */
    scope: text("scope").notNull(),
    /** Denormalised so the table is queryable in psql. bucket_key is the contract. */
    categorySlug: text("category_slug"),
    /** NULL means the bucket spans every condition, including unknown ones. */
    condition: conditionEnum("condition"),
    /** search_synonyms.canonical_term, NULL for category-scoped buckets. */
    term: text("term"),

    /** Before outlier trimming. rawSampleSize - sampleSize = trimmedCount. */
    rawSampleSize: integer("raw_sample_size").notNull(),
    /** After trimming — this is the number consumers gate on, and the one shown. */
    sampleSize: integer("sample_size").notNull(),
    /**
     * A bucket with trimmedCount > 0 is worth a look: the ejected rows are
     * either genuine luxury items or a mislabelled listing. It is the cheapest
     * label-quality signal we have.
     */
    trimmedCount: integer("trimmed_count").notNull(),

    medianEtb: integer("median_etb").notNull(),
    p25Etb: integer("p25_etb").notNull(),
    p75Etb: integer("p75_etb").notNull(),
    minEtb: integer("min_etb").notNull(),
    maxEtb: integer("max_etb").notNull(),

    /**
     * Tukey fences computed in log space, not linear. Used prices are roughly
     * log-normal, and a linear `p25 - 1.5*IQR` goes negative on every bucket we
     * have — it clamps to zero and never fires, which makes it useless as the
     * low-side scam signal. In log space the fence lands somewhere plausible.
     */
    lowFenceEtb: integer("low_fence_etb").notNull(),
    highFenceEtb: integer("high_fence_etb").notNull(),

    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("price_stats_scope_idx").on(t.scope),
    index("price_stats_category_idx").on(t.categorySlug),
    index("price_stats_computed_at_idx").on(t.computedAt),
  ]
)

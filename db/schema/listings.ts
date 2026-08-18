import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  real,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core"
import { sql, type SQL } from "drizzle-orm"
import { vector } from "drizzle-orm/pg-core"
import { tierEnum, listingStatusEnum, conditionEnum } from "./enums"
import { users } from "./users"
import { categories } from "./categories"

/**
 * Custom tsvector column type for the generated FTS column.
 * Drizzle doesn't ship a native tsvector helper, so we declare it manually.
 */
const tsVector = customType<{ data: string }>({
  dataType() {
    return "tsvector"
  },
})

/**
 * listings — the canonical deduplicated entity that buyers see.
 *
 * One listing = one real-world item. Multiple Telegram posts of the same
 * item are collapsed here (the dedup cluster lives in listing_sources).
 * This is why seenInChannels can be > 1 and lowestPriceEtb may differ from
 * priceEtb.
 *
 * Price stored as integer ETB. No floats, no currency column.
 * seller_id is nullable — indexed (scraped) listings have no user attached
 * until the owner claims the listing via OTP.
 *
 * Never hard-delete rows. On removal requests set status = 'removed' to
 * satisfy right-to-erasure audit requirements under Proclamation 1321/2024
 * while keeping the historical record intact.
 *
 * Indexes:
 *   search_vector GIN     — full-text search via tsvector (simple config handles
 *                           Amharic + English without a language-specific dictionary)
 *   title_en pg_trgm GIN  — trigram index for fuzzy / prefix matching
 *   embedding HNSW        — cosine similarity for pgvector semantic dedup + search
 *   price, category,
 *   location, status+tier — b-tree indexes for filter/sort hot paths
 */
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),

    titleEn: text("title_en").notNull(),
    titleAm: text("title_am"),
    descriptionEn: text("description_en"),
    descriptionAm: text("description_am"),

    // Integer ETB — no floats, no currency column (constraint from spec)
    priceEtb: integer("price_etb"),
    lowestPriceEtb: integer("lowest_price_etb"), // min across all source messages
    negotiable: boolean("negotiable").notNull().default(false),

    categorySlug: text("category_slug").references(() => categories.slug),
    condition: conditionEnum("condition"),
    locationArea: text("location_area"),
    locationAreaAm: text("location_area_am"),
    locationCity: text("location_city").default("Addis Ababa"),

    tier: tierEnum("tier").notNull().default("indexed"),
    status: listingStatusEnum("status").notNull().default("live"),

    // Nullable — indexed listings have no user until claimed
    sellerId: uuid("seller_id").references(() => users.id),

    extractionConfidence: real("extraction_confidence"),
    seenInChannels: integer("seen_in_channels").notNull().default(1),

    // Generated tsvector for full-text search.
    // 'simple' config avoids language-specific stemming, which would mangle
    // Amharic text. pg_trgm on title_en handles the fuzzy/prefix case.
    searchVector: tsVector("search_vector").generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', coalesce(${listings.titleEn}, '') || ' ' || coalesce(${listings.titleAm}, '') || ' ' || coalesce(${listings.descriptionEn}, '') || ' ' || coalesce(${listings.locationArea}, ''))`
    ),

    // 768-dim embedding (text-embedding-004) for semantic dedup + vector search
    embedding: vector("embedding", { dimensions: 768 }),

    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // FTS — GIN on the generated tsvector column
    index("listings_search_vector_gin_idx").using("gin", t.searchVector),
    // pg_trgm — fuzzy/prefix match on English title
    index("listings_title_en_trgm_idx").using(
      "gin",
      sql`${t.titleEn} gin_trgm_ops`
    ),
    // pgvector — HNSW for approximate nearest-neighbour semantic search
    index("listings_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
    // B-tree indexes for filter/sort hot paths
    index("listings_price_etb_idx").on(t.priceEtb),
    index("listings_category_slug_idx").on(t.categorySlug),
    index("listings_location_area_idx").on(t.locationArea),
    index("listings_status_tier_idx").on(t.status, t.tier),
    index("listings_posted_at_idx").on(t.postedAt),
    index("listings_seller_id_idx").on(t.sellerId),
    // Backs the keyset cursor for the default "newest" sort on /browse —
    // WHERE (posted_at, id) < (cursor) ORDER BY posted_at DESC, id DESC.
    index("listings_posted_at_id_idx").on(t.postedAt.desc(), t.id),
  ]
)

import {
  pgTable,
  bigserial,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"

/**
 * images — listing photos stored in Cloudflare R2.
 *
 * r2_key is the stable identifier used to construct CDN URLs — we never store
 * full URLs so switching storage providers is a config change, not a migration.
 *
 * phash (perceptual hash) is computed from the first photo of each source
 * message. The dedup pipeline uses phash similarity as one of three signals
 * for collapsing cross-posted listings into one canonical row.
 *
 * sort_order = 0 is the hero image shown in listing cards.
 */
export const images = pgTable(
  "images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull().unique(),
    phash: text("phash"), // perceptual hash for near-duplicate detection
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("images_listing_id_sort_idx").on(t.listingId, t.sortOrder),
    index("images_phash_idx").on(t.phash),
  ]
)

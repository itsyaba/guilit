import {
  pgTable,
  bigserial,
  uuid,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./users"
import { listings } from "./listings"

/**
 * ratings — buyer-to-seller ratings, one per (seller, rater, listing) triple.
 *
 * Tied to a specific listing rather than free-floating so the review has
 * context, and so we can verify the rater actually interacted with the
 * listing before allowing a rating (future: check contact log).
 *
 * Score is 1–5 integer; no half-stars to avoid floating-point averaging bugs.
 */
export const ratings = pgTable(
  "ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    raterId: uuid("rater_id")
      .notNull()
      .references(() => users.id),
    listingId: uuid("listing_id").references(() => listings.id),
    score: integer("score").notNull(), // 1–5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One rating per (rater, seller, listing) — no ballot stuffing
    uniqueIndex("ratings_seller_rater_listing_uidx").on(
      t.sellerId,
      t.raterId,
      t.listingId
    ),
    index("ratings_seller_id_idx").on(t.sellerId),
  ]
)

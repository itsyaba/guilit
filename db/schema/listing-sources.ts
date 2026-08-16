import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"
import { rawMessages } from "./raw-messages"

/**
 * listing_sources — the dedup cluster join table.
 *
 * Maps many raw_messages → one listing. This is what makes "Seen in 4 channels
 * · lowest 8,500 ETB" possible: each row is one channel's post of the same
 * physical item.
 *
 * The unique constraint on (listing_id, raw_message_id) makes re-running the
 * dedup pipeline safe — inserting the same source twice is a no-op.
 */
export const listingSources = pgTable(
  "listing_sources",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    rawMessageId: bigint("raw_message_id", { mode: "number" })
      .notNull()
      .references(() => rawMessages.id),
    priceEtb: integer("price_etb"), // price as seen in this specific source message
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("listing_sources_listing_message_uidx").on(
      t.listingId,
      t.rawMessageId
    ),
    index("listing_sources_listing_id_idx").on(t.listingId),
    index("listing_sources_raw_message_id_idx").on(t.rawMessageId),
  ]
)

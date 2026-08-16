import {
  pgTable,
  bigserial,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"
import { users } from "./users"

/**
 * reports — user-submitted flags on listings.
 *
 * Reporter is nullable so anonymous reports are accepted. The trust-and-safety
 * routing rule: 3+ reports → auto-hide + queue for moderator review.
 *
 * Never delete report rows. They are part of the audit trail required under
 * Proclamation 1321/2024, and they feed the scam-signal classifier.
 */
export const reports = pgTable(
  "reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    reporterId: uuid("reporter_id").references(() => users.id), // nullable — anon reports
    reason: text("reason").notNull(), // e.g. 'scam', 'wrong_price', 'duplicate', 'offensive'
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reports_listing_id_idx").on(t.listingId),
    index("reports_reporter_id_idx").on(t.reporterId),
  ]
)

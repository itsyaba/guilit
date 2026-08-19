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
 * removal_requests — "this is mine, remove it" queue.
 *
 * Instead of immediately setting listing.status = 'removed', the /remove
 * route inserts here and the admin reviews before the takedown fires.
 * This gives the Trust team a chance to catch automated scraper abuse.
 *
 * status state machine:
 *   pending  → approved (listing → removed)
 *   pending  → rejected (listing stays live)
 *
 * Never hard-delete rows. Audit trail under Proclamation 1321/2024.
 */
export const removalRequests = pgTable(
  "removal_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    claimantPhone: text("claimant_phone"),
    claimantName: text("claimant_name"),
    detail: text("detail"),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("removal_requests_listing_id_idx").on(t.listingId),
    index("removal_requests_status_idx").on(t.status),
    index("removal_requests_created_at_idx").on(t.createdAt),
  ]
)

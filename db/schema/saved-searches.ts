import {
  pgTable,
  bigserial,
  uuid,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * saved_searches — buyer alerts: "notify me when a Samsung A54 under 15,000 appears."
 *
 * query is stored as a JSON blob matching the ListingQuery shape from lib/types.ts.
 * The ingestion pipeline matches every incoming listing against active saved
 * searches and sends a Telegram ping within minutes — this is the feature only
 * our architecture can deliver (Jiji sees only their own listings; we see all
 * channels).
 *
 * last_alert_at prevents duplicate pings for the same listing on re-runs.
 */
export const savedSearches = pgTable(
  "saved_searches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: jsonb("query").notNull(), // serialised ListingQuery
    alertsOn: boolean("alerts_on").notNull().default(true),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("saved_searches_user_id_idx").on(t.userId),
    index("saved_searches_alerts_on_idx").on(t.alertsOn),
  ]
)

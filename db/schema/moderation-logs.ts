import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"
import { users } from "./users"
import { channels } from "./channels"

/**
 * moderation_logs — append-only audit trail for every moderation action.
 *
 * Required by the Trust brief: "every action logged with the acting user and
 * timestamp." Never delete rows from this table.
 *
 * action values:
 *   approve            — listing set to live as-is
 *   approve_with_edits — listing fields patched, then set to live
 *   reject             — listing set to removed
 *   ban_channel        — channel set inactive, all its queued listings removed
 *   toggle_channel     — channel active flag toggled
 *   removal_approved   — owner removal request approved (listing → removed)
 *   removal_rejected   — owner removal request rejected (listing stays live)
 */
export const moderationLogs = pgTable(
  "moderation_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id").references(() => listings.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    reason: text("reason"),
    /** Snapshot of extracted fields before any admin edit. */
    editsBefore: jsonb("edits_before"),
    /** Snapshot of listing fields after admin edit. */
    editsAfter: jsonb("edits_after"),
    /** Populated for ban_channel / toggle_channel actions. */
    channelId: bigint("channel_id", { mode: "number" }).references(
      () => channels.id
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("mod_logs_listing_id_idx").on(t.listingId),
    index("mod_logs_actor_id_idx").on(t.actorId),
    index("mod_logs_action_idx").on(t.action),
    index("mod_logs_created_at_idx").on(t.createdAt),
  ]
)

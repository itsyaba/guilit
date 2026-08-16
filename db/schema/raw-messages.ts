import {
  pgTable,
  bigserial,
  bigint,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { channels } from "./channels"

/**
 * raw_messages — every Telegram message captured verbatim before any processing.
 *
 * Raw-first storage is the foundation of the whole pipeline:
 * - Extraction logic will be wrong on day 3 and right on day 9. Tuning the
 *   prompt, adding categories, fixing Amharic phrasing — each change becomes
 *   a local batch re-run rather than a re-scrape.
 * - Separates failure domains: the listener does one dumb fast thing (insert).
 *   If Gemini is down, capture keeps running and nothing is lost.
 * - The moderator dashboard shows the original message beside extracted fields.
 *
 * (channel_id, message_id) unique constraint is critical for backfill
 * idempotency: the ingest worker can crash halfway and re-run without
 * creating duplicates.
 */
export const rawMessages = pgTable(
  "raw_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channelId: bigint("channel_id", { mode: "number" })
      .notNull()
      .references(() => channels.id),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    groupedId: bigint("grouped_id", { mode: "number" }), // Telegram album grouping
    rawText: text("raw_text"),
    mediaRefs: text("media_refs").array(), // R2 keys or tg file IDs pre-upload
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }), // null = queued for extraction
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("raw_messages_channel_message_uidx").on(t.channelId, t.messageId),
    index("raw_messages_processed_at_idx").on(t.processedAt),
    index("raw_messages_grouped_id_idx").on(t.groupedId),
  ]
)

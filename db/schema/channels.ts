import {
  pgTable,
  bigserial,
  bigint,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core"

/**
 * channels — the allowlisted Telegram channels we ingest from.
 *
 * last_message_id enables resumable backfill: the listener stores the
 * highest message_id it has seen and resumes from there on restart,
 * so a crashed worker never re-fetches the full history.
 */
export const channels = pgTable("channels", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
  lastMessageId: bigint("last_message_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

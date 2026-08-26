import {
  pgTable,
  uuid,
  bigint,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { trustLevelEnum } from "./enums"

/**
 * users — registered users, whether they signed up via Telegram OTP or native post.
 *
 * seller_id on listings is nullable — indexed (scraped) listings have no user
 * attached. A user row is only created when someone claims a listing or posts
 * directly. The claiming flow is the primary acquisition path: the OTP is sent
 * to the phone number already in the listing, proving ownership without
 * paperwork.
 *
 * Phone numbers are normalised to +251... on write. We store the raw channel
 * telegram_id for linking scraped attributions back to a user who later joins.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: bigint("telegram_id", { mode: "number" }).unique(),
    username: text("username"),
    phone: text("phone"), // +251XXXXXXXXX — normalised on write
    phoneVerified: boolean("phone_verified").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),
    trustLevel: trustLevelEnum("trust_level").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("users_phone_idx").on(t.phone),
    index("users_telegram_id_idx").on(t.telegramId),
  ]
)

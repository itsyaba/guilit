import { pgTable, bigserial, text, timestamp, index } from "drizzle-orm/pg-core"

/**
 * rate_limit_hits — a fixed-window counter backed by Postgres, not Redis.
 *
 * One row per request that should count against a limit. `key` encodes the
 * scope, e.g. `otp:phone:+251911000000`, `otp:ip:1.2.3.4`, `report:ip:1.2.3.4`.
 * Checking a limit is a COUNT of recent rows for that key; there's no cron
 * cleanup because at this scale the table stays small and rows are cheap to
 * leave — pruning can be added later if it ever matters.
 */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("rate_limit_hits_key_created_at_idx").on(t.key, t.createdAt)]
)

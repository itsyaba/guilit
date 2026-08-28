import {
  pgTable,
  uuid,
  bigint,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { users } from "./users"

/**
 * login_tokens — one row per attempt at the bot deep-link login.
 *
 * The Telegram Login Widget asks for a phone number and then waits on a service
 * message that, for a lot of accounts, never arrives — there is no error, just
 * a spinner, because Telegram will not leak whether a number is registered.
 * This table backs the flow that replaces it: the browser mints a row, sends
 * the user to `t.me/<bot>?start=<nonce>`, and the bot webhook approves the row
 * when the tap lands. Nothing depends on a phone number or on oauth.telegram.org.
 *
 * Two secrets, deliberately:
 *
 *   nonce         travels through Telegram, so it is public by construction —
 *                 it sits in a t.me URL, in the user's chat history, and in
 *                 Telegram's logs.
 *   verifier_hash sha256 of a secret held only in the initiating browser's
 *                 httpOnly cookie.
 *
 * Approving needs the nonce; *collecting the session* needs both. Without the
 * split, anyone who saw the deep link — over someone's shoulder, in a forwarded
 * message — could poll for the session it opens.
 *
 * `consumed_at` is what makes the token single-use: the poll route claims it
 * with an UPDATE ... WHERE consumed_at IS NULL, so two tabs racing produce one
 * session and one miss rather than two sessions.
 */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nonce: text("nonce").notNull().unique(),
    verifierHash: text("verifier_hash").notNull(),
    /** Set by the bot webhook once the user taps Start. */
    telegramId: bigint("telegram_id", { mode: "number" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Where to land afterwards — the `?next=` the login page was opened with. */
    nextPath: text("next_path"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_tokens_expires_at_idx").on(t.expiresAt),
    index("login_tokens_user_id_idx").on(t.userId),
  ]
)

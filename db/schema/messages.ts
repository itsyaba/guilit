import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { conversations } from "./conversations"
import { messageKindEnum } from "./enums"
import { users } from "./users"

/**
 * messages — the messages in a conversation.
 *
 * read_at is per message rather than a single per-thread cursor so the unread
 * badge is one count query and marking a thread read is one UPDATE, with no
 * ambiguity about what happens when both sides are typing at once.
 *
 * `kind` says what the row is; see message_kind in ./enums.
 *
 * system messages have no sender: they are the platform narrating something
 * that happened outside the thread — a Chapa deposit clearing, a listing being
 * withdrawn. Rendered differently and never notified on, because the person
 * who caused them is already looking at the result.
 *
 * payment_request rows carry `amount_etb` and are the seller asking for a
 * specific figure after a negotiation moved off the asking price. They live in
 * the message table rather than in a table of their own so that a request sits
 * in the thread in the order it was actually sent — beside the sentence that
 * agreed the number — and so the existing poll delivers it with no second
 * stream to keep in sync. Their state is derived, not stored: a request is paid
 * when a reservation points back at it (see reservations.request_message_id),
 * which means there is exactly one row that can say whether money moved.
 *
 * Never hard-delete. A message is the only record of what was agreed, and a
 * reported thread needs to still contain the thing that was reported.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Null for system messages — see above. */
    senderId: uuid("sender_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: messageKindEnum("kind").notNull().default("text"),
    body: text("body").notNull(),
    /**
     * Integer ETB, set only on payment_request rows. Snapshotted here rather
     * than read from the listing at pay time: the buyer is agreeing to the
     * number they can see, and a seller editing the price afterwards must not
     * change what that tap costs.
     */
    amountEtb: integer("amount_etb"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Thread view reads in insertion order; the poll reads the tail.
    index("messages_conversation_created_idx").on(
      t.conversationId,
      t.createdAt
    ),
    // Unread badge: count where read_at is null and sender is not me.
    index("messages_unread_idx").on(t.conversationId, t.readAt),
    // The thread rail needs the newest open request in a conversation.
    index("messages_kind_idx").on(t.conversationId, t.kind),
  ]
)

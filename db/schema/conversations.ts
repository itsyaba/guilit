import {
  pgTable,
  uuid,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"
import { listings } from "./listings"
import { users } from "./users"

/**
 * conversations — one buyer talking to one seller about one item.
 *
 * Scoped to a listing rather than to a pair of people. Two buyers asking about
 * the same sofa are two threads, and the same buyer coming back about a second
 * item is a second thread, because "is it still available" means nothing
 * without knowing what "it" is. That is also what lets the thread header carry
 * the photo and price without a join the UI has to guess at.
 *
 * Both participants are denormalised onto the row. seller_id is copied from
 * listings.seller_id at creation instead of being read through the listing on
 * every query: a listing that later changes hands must not hand the new owner
 * the previous owner's private messages.
 *
 * Only listings with a registered seller can have a thread — an indexed,
 * unclaimed listing has no account to deliver to, and contact there routes to
 * the original Telegram post (see components/listing/contact-panel).
 *
 * last_message_at is maintained on every insert. The inbox sorts by it, and
 * doing that with max(messages.created_at) meant a scan of the whole message
 * table for a page that renders on every visit.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One thread per buyer per listing. A second "message the seller" from the
    // same buyer appends rather than opening a duplicate thread.
    uniqueIndex("conversations_listing_buyer_uidx").on(t.listingId, t.buyerId),
    // Backs the inbox query for either role — a user is a buyer in some
    // threads and a seller in others, and the inbox shows both.
    index("conversations_buyer_last_msg_idx").on(
      t.buyerId,
      t.lastMessageAt.desc()
    ),
    index("conversations_seller_last_msg_idx").on(
      t.sellerId,
      t.lastMessageAt.desc()
    ),
    index("conversations_listing_id_idx").on(t.listingId),
  ]
)

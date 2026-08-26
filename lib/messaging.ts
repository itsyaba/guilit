import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/db/client"
import {
  conversations,
  images,
  listings,
  messages,
  reservations,
  users,
} from "@/db/schema"
import type { DbConversation } from "@/db/types"
import { depositForPrice, holdHours } from "@/lib/chapa"
import { getActiveHold } from "@/lib/hold-view"
import { formatAmount } from "@/lib/format"
import { getImageUrl } from "@/lib/media"
import { escapeHtml, notifyTelegram } from "@/lib/notify"
import type {
  ConversationRole,
  ConversationSummary,
  ConversationThread,
  MessageKind,
  PaymentRequestState,
  ReservationView,
  ThreadMessage,
} from "@/lib/types"

/**
 * In-app messaging between a buyer and a registered seller.
 *
 * The product's default contact route is still Telegram, and that is a
 * deliberate choice, not a gap — for a scraped listing the seller never agreed
 * to talk to us and their own channel post is the honest place to reach them.
 * This module covers the case that route cannot serve: a listing posted here by
 * someone whose only identity is their Gulit account, where "open the original
 * post" points at nothing.
 *
 * So a thread exists only where there is a registered seller to deliver to.
 * `canMessage` is that rule, and it is checked here rather than in each route.
 */

/** Long enough for "is the price negotiable and can I see it Saturday", short
 *  enough that the column stays readable in a moderation view. */
export const MESSAGE_MAX_CHARS = 2000

/** Inbox depth. Past this, a thread is old enough that search is the answer. */
const INBOX_LIMIT = 100

/** Thread depth. A used-goods negotiation that runs longer has moved to a call. */
const THREAD_LIMIT = 500

const buyerUser = alias(users, "buyer_user")
const sellerUser = alias(users, "seller_user")

/**
 * Whether this listing can carry a thread at all.
 *
 * Both halves matter. No seller account means nowhere to deliver. A listing
 * that is hidden, removed or still queued must not accept new messages either:
 * the first two are gone on purpose, and the third has its contact routes
 * closed pending review, which a message form would quietly reopen.
 */
export function canMessage(listing: {
  sellerId: string | null
  status: string
}): boolean {
  return listing.sellerId !== null && listing.status === "live"
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

/**
 * Last message and unread count come back as correlated subqueries rather than
 * as a second round trip and a JS regroup. Both are single-row lookups on
 * `messages_conversation_created_idx`, and keeping them inside the one statement
 * is what lets the inbox render from a single query no matter how many threads
 * it holds.
 */
function summarySelection(userId: string) {
  return {
    id: conversations.id,
    buyerId: conversations.buyerId,
    sellerId: conversations.sellerId,
    lastMessageAt: conversations.lastMessageAt,

    listingId: listings.id,
    listingSlug: listings.slug,
    listingTitle: listings.titleEn,
    listingPrice: listings.priceEtb,
    listingStatus: listings.status,

    buyerHandle: buyerUser.username,
    sellerHandle: sellerUser.username,

    firstImageKey: sql<string | null>`(
      select i.r2_key from ${images} i
      where i.listing_id = ${listings.id}
      order by i.sort_order asc
      limit 1
    )`,
    lastMessage: sql<string | null>`(
      select m.body from ${messages} m
      where m.conversation_id = ${conversations.id}
      order by m.created_at desc
      limit 1
    )`,
    /**
     * A system message counts as unread — a cleared deposit is exactly the kind
     * of thing the badge exists to surface. Own messages never do.
     */
    unread: sql<number>`(
      select count(*) from ${messages} m
      where m.conversation_id = ${conversations.id}
        and m.read_at is null
        and (m.sender_id is null or m.sender_id <> ${userId})
    )`,
  }
}

type SummaryRow = {
  id: string
  buyerId: string
  sellerId: string
  lastMessageAt: Date
  listingId: string
  listingSlug: string
  listingTitle: string
  listingPrice: number | null
  listingStatus: string
  buyerHandle: string | null
  sellerHandle: string | null
  firstImageKey: string | null
  lastMessage: string | null
  unread: number
}

function toSummary(row: SummaryRow, userId: string): ConversationSummary {
  const role = row.buyerId === userId ? "buyer" : "seller"
  return {
    id: row.id,
    role,
    counterpart: role === "buyer" ? row.sellerHandle : row.buyerHandle,
    listing: {
      id: row.listingId,
      slug: row.listingSlug,
      title: row.listingTitle,
      priceEtb: row.listingPrice,
      imageUrl: row.firstImageKey ? getImageUrl(row.firstImageKey) : null,
      status: row.listingStatus as ConversationSummary["listing"]["status"],
    },
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt.toISOString(),
    unread: Number(row.unread ?? 0),
  }
}

/** Every thread this user is in, either side of it, newest activity first. */
export async function listConversations(
  userId: string
): Promise<ConversationSummary[]> {
  const rows = await db
    .select(summarySelection(userId))
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .innerJoin(buyerUser, eq(conversations.buyerId, buyerUser.id))
    .innerJoin(sellerUser, eq(conversations.sellerId, sellerUser.id))
    .where(
      or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId))
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(INBOX_LIMIT)

  return rows.map((row) => toSummary(row as SummaryRow, userId))
}

/**
 * One thread, or null.
 *
 * Null covers both "no such thread" and "not yours" on purpose: telling a
 * stranger that a conversation id exists is already more than they should learn
 * from a URL they guessed.
 */
export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ConversationThread | null> {
  const [row] = await db
    .select(summarySelection(userId))
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .innerJoin(buyerUser, eq(conversations.buyerId, buyerUser.id))
    .innerJoin(sellerUser, eq(conversations.sellerId, sellerUser.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId))
      )
    )
    .limit(1)

  if (!row) return null

  const messageRows = await db
    .select(MESSAGE_COLUMNS)
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(THREAD_LIMIT)

  const summary = toSummary(row as SummaryRow, userId)

  /**
   * Payment-request state and the live hold come from the same read, because
   * they are answers to one question: can this person pay right now. Resolving
   * them separately is how a thread ends up offering a second deposit on an
   * item it has already told you is held.
   */
  const deal = await resolveDeal({
    conversationId,
    listingId: summary.listing.id,
    listingStatus: summary.listing.status,
    priceEtb: summary.listing.priceEtb,
    role: summary.role,
    viewerId: userId,
  })

  return {
    ...summary,
    messages: messageRows.map((m) =>
      toThreadMessage(m, userId, deal.requestStates.get(m.id) ?? null)
    ),
    depositEtb: depositForPrice(summary.listing.priceEtb),
    holdHours: holdHours(),
    reservation: deal.hold,
  }
}

/** One place the message columns are named, so every reader agrees on shape. */
const MESSAGE_COLUMNS = {
  id: messages.id,
  senderId: messages.senderId,
  kind: messages.kind,
  body: messages.body,
  amountEtb: messages.amountEtb,
  createdAt: messages.createdAt,
}

type MessageRow = {
  id: string
  senderId: string | null
  kind: MessageKind
  body: string
  amountEtb: number | null
  createdAt: Date
}

function toThreadMessage(
  m: MessageRow,
  userId: string,
  request: PaymentRequestState | null
): ThreadMessage {
  return {
    id: m.id,
    body: m.body,
    author:
      m.kind === "system" ? "system" : m.senderId === userId ? "me" : "them",
    kind: m.kind,
    createdAt: m.createdAt.toISOString(),
    request,
  }
}

/** Messages in this thread newer than `since`, for the poll. */
export async function getMessagesSince(
  conversationId: string,
  userId: string,
  since: Date | null
): Promise<ThreadMessage[] | null> {
  const [participant] = await db
    .select({
      buyerId: conversations.buyerId,
      listingId: conversations.listingId,
      listingStatus: listings.status,
      priceEtb: listings.priceEtb,
    })
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId))
      )
    )
    .limit(1)
  if (!participant) return null

  const rows = await db
    .select(MESSAGE_COLUMNS)
    .from(messages)
    .where(
      since
        ? and(
            eq(messages.conversationId, conversationId),
            sql`${messages.createdAt} > ${since.toISOString()}`
          )
        : eq(messages.conversationId, conversationId)
    )
    .orderBy(asc(messages.createdAt))
    .limit(THREAD_LIMIT)

  /**
   * Resolved even when the tail holds no request of its own. A request sent
   * five minutes ago becomes unpayable the moment somebody else's hold lands,
   * and the poll is the only thing that will tell this tab about it — so the
   * state of *every* request in the thread is recomputed, and the client merges
   * by id.
   */
  const deal = await resolveDeal({
    conversationId,
    listingId: participant.listingId,
    listingStatus: participant.listingStatus,
    priceEtb: participant.priceEtb,
    role: participant.buyerId === userId ? "buyer" : "seller",
    viewerId: userId,
  })

  return rows.map((row) =>
    toThreadMessage(row, userId, deal.requestStates.get(row.id) ?? null)
  )
}

// --------------------------------------------------------------------------
// Payment requests
// --------------------------------------------------------------------------

type Deal = {
  hold: ReservationView | null
  requestStates: Map<string, PaymentRequestState>
}

/**
 * Works out, for one viewer, what can be paid in this thread right now.
 *
 * The rules, in the order they matter:
 *
 *   paid   — a reservation points back at this request and cleared. Terminal,
 *            and checked first: a paid request must never read as stale just
 *            because the hold it created is now the thing blocking new ones.
 *   stale  — superseded by a later request, or the listing is not live, or some
 *            hold is already on the item. All three mean "tapping Pay would
 *            fail", and saying so on the card beats a button that 409s.
 *   open   — none of the above. Only the buyer sees a button; the seller sees
 *            their own request as pending, which is what it is.
 */
async function resolveDeal(input: {
  conversationId: string
  listingId: string
  listingStatus: string
  priceEtb: number | null
  role: ConversationRole
  viewerId: string
}): Promise<Deal> {
  const [requestRows, hold] = await Promise.all([
    db
      .select({
        id: messages.id,
        amountEtb: messages.amountEtb,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          eq(messages.kind, "payment_request")
        )
      )
      .orderBy(asc(messages.createdAt)),
    getActiveHold(input.listingId, input.viewerId),
  ])

  const requestStates = new Map<string, PaymentRequestState>()
  if (requestRows.length === 0) return { hold, requestStates }

  const settled = await db
    .select({
      requestMessageId: reservations.requestMessageId,
      status: reservations.status,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.listingId, input.listingId),
        inArray(
          reservations.requestMessageId,
          requestRows.map((r) => r.id)
        )
      )
    )

  const paidRequests = new Set(
    settled
      .filter((r) => r.status === "paid" || r.status === "completed")
      .map((r) => r.requestMessageId)
      .filter((id): id is string => id !== null)
  )

  const newestId = requestRows[requestRows.length - 1].id

  for (const request of requestRows) {
    const amountEtb = request.amountEtb ?? 0

    if (paidRequests.has(request.id)) {
      requestStates.set(request.id, {
        amountEtb,
        status: "paid",
        canPay: false,
        note: "Paid",
      })
      continue
    }

    const blocked =
      request.id !== newestId
        ? "Replaced by a later request"
        : input.listingStatus !== "live"
          ? "This listing is no longer live"
          : hold
            ? hold.viewer === "buyer"
              ? "You already have a hold on this item"
              : "This item is already on hold"
            : null

    if (blocked) {
      requestStates.set(request.id, {
        amountEtb,
        status: "stale",
        canPay: false,
        note: blocked,
      })
      continue
    }

    requestStates.set(request.id, {
      amountEtb,
      status: "open",
      canPay: input.role === "buyer",
      note: input.role === "buyer" ? null : "Waiting for the buyer",
    })
  }

  return { hold, requestStates }
}

/**
 * The request the buyer is currently able to pay, if there is one.
 *
 * Used by the pay route rather than trusting the id the client sent on its own:
 * a request that has been superseded, already paid, or overtaken by someone
 * else's hold must be refused even if the buyer's tab still shows a button for
 * it.
 */
export async function getPayableRequest(
  conversationId: string,
  buyerId: string,
  requestMessageId: string
): Promise<{ amountEtb: number } | null> {
  const [conversation] = await db
    .select({
      buyerId: conversations.buyerId,
      listingId: conversations.listingId,
      listingStatus: listings.status,
      priceEtb: listings.priceEtb,
    })
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .where(eq(conversations.id, conversationId))
    .limit(1)

  if (!conversation || conversation.buyerId !== buyerId) return null

  const deal = await resolveDeal({
    conversationId,
    listingId: conversation.listingId,
    listingStatus: conversation.listingStatus,
    priceEtb: conversation.priceEtb,
    role: "buyer",
    viewerId: buyerId,
  })

  const state = deal.requestStates.get(requestMessageId)
  if (!state || !state.canPay || state.amountEtb <= 0) return null
  return { amountEtb: state.amountEtb }
}

/**
 * Records the seller's ask as a message in the thread.
 *
 * The amount is validated by the caller against the listing price — this
 * function is the write, not the policy.
 */
export async function postPaymentRequest(input: {
  conversationId: string
  sellerId: string
  amountEtb: number
  note?: string | null
}): Promise<ThreadMessage> {
  const note = input.note?.trim()
  return postMessage({
    conversationId: input.conversationId,
    senderId: input.sellerId,
    kind: "payment_request",
    amountEtb: input.amountEtb,
    /**
     * A body even though the card renders the figure: this string is what lands
     * in the Telegram push, in the inbox preview, and in a moderator's view of a
     * reported thread, none of which render the card.
     */
    body:
      note && note.length > 0
        ? note
        : `Deposit request: ${formatAmount(input.amountEtb)} ETB to hold this item.`,
  })
}

/** Badge in the header. One count over the index, cheap enough per request. */
export async function unreadMessageCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        isNull(messages.readAt),
        or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId)),
        // A system message has no sender, so `ne` alone would exclude it.
        or(isNull(messages.senderId), ne(messages.senderId, userId))
      )
    )

  return Number(row?.count ?? 0)
}

// --------------------------------------------------------------------------
// Writes
// --------------------------------------------------------------------------

/**
 * The thread for this (listing, buyer), creating it if this is the first
 * message.
 *
 * `onConflictDoNothing` plus a read is the concurrency-safe version: two taps
 * on "send" arriving together produce one insert and one no-op, and the no-op
 * then reads the row the winner wrote. Doing it as select-then-insert would
 * hand the loser a unique-violation 500 instead.
 */
export async function getOrCreateConversation(input: {
  listingId: string
  buyerId: string
  sellerId: string
}): Promise<DbConversation> {
  const [inserted] = await db
    .insert(conversations)
    .values(input)
    .onConflictDoNothing({
      target: [conversations.listingId, conversations.buyerId],
    })
    .returning()

  if (inserted) return inserted

  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.listingId, input.listingId),
        eq(conversations.buyerId, input.buyerId)
      )
    )
    .limit(1)

  return existing
}

/**
 * Appends a message and bumps the thread.
 *
 * One transaction, because a message whose thread still claims an older
 * last_message_at sorts to the bottom of the recipient's inbox — the write
 * succeeded and the notification is useless.
 */
export async function postMessage(input: {
  conversationId: string
  senderId: string | null
  body: string
  kind?: MessageKind
  amountEtb?: number
}): Promise<ThreadMessage> {
  const body = input.body.trim().slice(0, MESSAGE_MAX_CHARS)
  const kind = input.kind ?? "text"

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        kind,
        body,
        amountEtb: kind === "payment_request" ? input.amountEtb : null,
      })
      .returning()

    await tx
      .update(conversations)
      .set({ lastMessageAt: row.createdAt })
      .where(eq(conversations.id, input.conversationId))

    /**
     * The returned state is the writer's own view: a request they just sent is
     * open and not theirs to pay. The reader's view is recomputed on the next
     * poll, which is where a buyer's payable card comes from.
     */
    return {
      id: row.id,
      body: row.body,
      author: row.kind === "system" ? "system" : "me",
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
      request:
        row.kind === "payment_request"
          ? {
              amountEtb: row.amountEtb ?? 0,
              status: "open" as const,
              canPay: false,
              note: "Waiting for the buyer",
            }
          : null,
    }
  })
}

/**
 * Marks everything the other party sent as read.
 *
 * Called when the thread page renders, which is the only honest definition of
 * read we have — there is no delivery receipt to lean on and no reason to
 * pretend otherwise.
 */
export async function markThreadRead(
  conversationId: string,
  userId: string
): Promise<void> {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.readAt),
        or(isNull(messages.senderId), ne(messages.senderId, userId))
      )
    )
}

/**
 * Platform narration inside a thread — a deposit clearing, a hold lapsing.
 *
 * Lives here rather than in the payment code so that everything writing to a
 * conversation goes through one function that keeps last_message_at honest.
 */
export async function postSystemMessage(
  conversationId: string,
  body: string
): Promise<void> {
  await postMessage({ conversationId, senderId: null, body, kind: "system" })
}

/**
 * Pokes the other party in Telegram about a new message.
 *
 * Fire-and-forget from the route — the message is already committed, and the
 * point of this is reach, not delivery guarantees. See lib/notify.ts for why a
 * failure here is ordinary rather than exceptional.
 *
 * The preview is truncated and HTML-escaped: it is another user's text going
 * into a `parse_mode: HTML` payload, so it is treated as hostile input even
 * though it is on its way to the person it was written for.
 */
export async function notifyCounterpart(
  conversationId: string,
  senderId: string,
  preview: string
): Promise<void> {
  const [row] = await db
    .select({
      buyerId: conversations.buyerId,
      sellerId: conversations.sellerId,
      buyerTelegramId: buyerUser.telegramId,
      sellerTelegramId: sellerUser.telegramId,
      senderHandle: sql<string | null>`(
        select u.username from ${users} u where u.id = ${senderId}
      )`,
      listingTitle: listings.titleEn,
    })
    .from(conversations)
    .innerJoin(listings, eq(conversations.listingId, listings.id))
    .innerJoin(buyerUser, eq(conversations.buyerId, buyerUser.id))
    .innerJoin(sellerUser, eq(conversations.sellerId, sellerUser.id))
    .where(eq(conversations.id, conversationId))
    .limit(1)

  if (!row) return

  const recipientTelegramId =
    senderId === row.buyerId ? row.sellerTelegramId : row.buyerTelegramId
  if (!recipientTelegramId) return

  const who = row.senderHandle ? `@${row.senderHandle}` : "A buyer"
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""

  void notifyTelegram(
    recipientTelegramId,
    [
      `<b>${escapeHtml(who)}</b> messaged you about ${escapeHtml(row.listingTitle)}`,
      "",
      escapeHtml(preview.slice(0, 200)),
      "",
      `Reply: ${base}/messages/${conversationId}`,
    ].join("\n")
  )
}

/**
 * What the listing page needs to know about messaging, for one viewer.
 *
 * Kept out of `getListing` on purpose. That function feeds the browse grid as
 * well, is memoised per request without a session, and is the one query on the
 * hot path — adding a per-viewer join to it would make every card on a
 * 24-listing page pay for something only the detail page renders. It also keeps
 * seller ids out of the shape the UI receives.
 */
export type ListingMessagingContext = {
  /** A registered seller exists and the listing is open for messages. */
  canMessage: boolean
  /** The viewer is the seller — no "message yourself" button. */
  isOwnListing: boolean
  /** The viewer's existing thread about this item, if they have one. */
  conversationId: string | null
}

export async function getListingMessagingContext(
  listingId: string,
  viewerId: string | null
): Promise<ListingMessagingContext> {
  const [listing] = await db
    .select({ sellerId: listings.sellerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)

  if (!listing) {
    return { canMessage: false, isOwnListing: false, conversationId: null }
  }

  const isOwnListing = viewerId !== null && listing.sellerId === viewerId

  if (!viewerId || isOwnListing) {
    return {
      canMessage: canMessage(listing) && !isOwnListing,
      isOwnListing,
      conversationId: null,
    }
  }

  const [thread] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.listingId, listingId),
        eq(conversations.buyerId, viewerId)
      )
    )
    .limit(1)

  return {
    canMessage: canMessage(listing),
    isOwnListing: false,
    conversationId: thread?.id ?? null,
  }
}

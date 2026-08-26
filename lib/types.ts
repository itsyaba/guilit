/**
 * Shape of a listing as the UI consumes it.
 *
 * This mirrors `fixtures/listings.json` today and is intended to mirror the
 * `/api/listings` response tomorrow. Components import from here, never from
 * the fixture file, so swapping the data source touches one module.
 */

export type ListingTier = "indexed" | "claimed" | "native"

/** Mirrors db/schema/enums.ts listingStatusEnum. */
export type ListingStatus = "queued" | "live" | "hidden" | "removed"

/** Mirrors db/schema/enums.ts trustLevelEnum. */
export type TrustLevel = "new" | "established" | "flagged"

export type ListingCondition = "brand_new" | "lightly_used" | "fair"

export type PriceVerdict = "below" | "fair" | "above" | "suspicious" | "unknown"

export type ListingImage = {
  url: string
  width: number
  height: number
  alt: string
}

export type ListingSource = {
  channelHandle: string
  channelTitle: string
  messageUrl: string
  postedAt: string
  priceEtb: number | null
}

export type ListingSeller = {
  displayName: string | null
  telegramHandle: string | null
  /** Unmasked — needed as the literal href value for a tel: link. */
  phone: string | null
  phoneMasked: string | null
  phoneVerified: boolean
  ratingAvg: number | null
  ratingCount: number | null
  memberSince: string | null
}

export type Listing = {
  id: string
  slug: string
  title: string
  titleAm: string | null
  description: string
  descriptionAm: string | null
  priceEtb: number | null
  currency: string
  negotiable: boolean
  categorySlug: string
  categoryLabel: string
  categoryLabelAm: string
  /**
   * A `queued` listing is reachable by direct link but has its contact routes
   * withheld until a moderator clears it — see components/listing/contact-panel.
   */
  status: ListingStatus
  /** Null when the source post never said. Do not default it — a fabricated
   *  condition is a claim about someone else's item. */
  condition: ListingCondition | null
  location: { area: string; areaAm: string; city: string }
  tier: ListingTier
  images: ListingImage[]
  seller: ListingSeller
  sources: ListingSource[]
  seenInChannels: number
  lowestPriceEtb: number | null
  extractionConfidence: number
  postedAt: string
  updatedAt: string
  _note?: string
}

export type AdminChannel = {
  id: number
  telegramId: number
  username: string
  title: string
  active: boolean
  lastMessageId: number | null
  messageCount: number
  createdAt: string
  _note?: string
}

export type AdminChannelStats = AdminChannel & {
  messagesCaptured: number
  listingsExtracted: number
  rejectionRatePct: number | null
}

export type ModerationRawMessage = {
  id: number
  channelId: number
  channelUsername: string
  messageId: number
  rawText: string | null
  mediaRefs: string[]
  postedAt: string
}

export type ModerationExtraction = {
  titleEn: string | null
  titleAm: string | null
  descriptionEn: string | null
  descriptionAm: string | null
  priceEtb: number | null
  currency: string
  categorySlug: string
  categoryLabel: string
  condition: ListingCondition
  locationArea: string
  locationCity: string
  phoneRaw: string | null
  phoneNormalized: string | null
  confidenceScore: number
}

/** @deprecated Use AdminQueueItem instead — kept for fixture compatibility during migration. */
export type QueuedJob = {
  id: number
  type: string
  status: "pending" | "running" | "done" | "failed"
  listingId: string | null
  rawMessageId: number | null
  attempts: number
  runAfter: string
  createdAt: string
  reason?: string
  channel?: { id: number; username: string; title: string }
  rawMessage?: ModerationRawMessage
  extraction?: ModerationExtraction
  payload: Record<string, unknown>
  _note?: string
}

export type QueueReason =
  | "low_confidence"
  | "price_outlier"
  | "flagged_phone"
  | "report_threshold"
  | "borderline_dedup"
  /** Native post from an account that hasn't earned instant publish yet. */
  | "new_seller"

export type ModerationDecision =
  | "approve"
  | "approve_with_edits"
  | "reject"
  | "ban_channel"

/** Seller behind a native queued post — the moderator's only trust signal there. */
export type AdminQueueSeller = {
  id: string
  username: string | null
  phone: string | null
  phoneVerified: boolean
  trustLevel: TrustLevel
  memberSince: string | null
}

/**
 * Real-DB queue item returned by GET /api/admin/queue.
 *
 * Covers both origins. A scraped item has a channel, a raw Telegram message and
 * an extraction with a confidence score; a native item has none of those — its
 * review surface is the seller's own photos and fields. Hence the nullable
 * fields: `source` tells the UI which shape it's holding.
 */
export type AdminQueueItem = {
  listingId: string
  slug: string
  source: "scraped" | "native"
  titleEn: string | null
  titleAm: string | null
  priceEtb: number | null
  categorySlug: string | null
  categoryLabel: string | null
  /** 0 for native posts — nothing extracted them, so there's nothing to score. */
  confidenceScore: number
  queueReason: QueueReason
  reportCount: number
  seenInChannels: number
  rawMessage: ModerationRawMessage | null
  extraction: ModerationExtraction
  channel: { id: number; username: string; title: string } | null
  /** Photo URLs. Populated for native posts; scraped media lives in rawMessage. */
  images: string[]
  seller: AdminQueueSeller | null
  queuedAt: string
}

export type AdminReport = {
  id: number
  listingId: string
  reason: string
  detail: string | null
  createdAt: string
  listing: Listing
}

export type AdminRemovalRequest = {
  id: number
  listingId: string
  claimantPhone: string | null
  claimantName: string | null
  detail: string | null
  status: "pending" | "approved" | "rejected"
  createdAt: string
  listing: Listing
}


export type CategoryOption = { slug: string; label: string; labelAm: string }
export type ConditionOption = {
  value: ListingCondition
  label: string
  labelAm: string
}
export type TierOption = { value: ListingTier; label: string; labelAm: string }
export type AreaOption = { area: string; areaAm: string }

export type FilterOptions = {
  categories: CategoryOption[]
  conditions: ConditionOption[]
  tiers: TierOption[]
  areas: AreaOption[]
  priceBoundsEtb: { min: number; max: number }
  channelCount: number
}

// --------------------------------------------------------------------------
// Messaging
// --------------------------------------------------------------------------

/**
 * Who wrote a message, from the point of view of whoever is reading it.
 *
 * Resolved on the server rather than shipping sender ids to the browser and
 * comparing there: the thread view is the one place two people's private text
 * sits in one payload, and the less of the other person's identity crosses the
 * wire, the less there is to leak.
 */
export type MessageAuthor = "me" | "them" | "system"

/** Mirrors db/schema/enums.ts messageKindEnum. */
export type MessageKind = "text" | "system" | "payment_request"

/**
 * A seller's request for a specific amount, as the thread renders it.
 *
 * Status is derived on read, never stored — see db/schema/messages.ts. A request
 * is `paid` when a reservation points back at it, `stale` when something has
 * overtaken it (a newer request, a hold already on the item, a listing pulled),
 * and `open` only when tapping Pay would actually work.
 *
 * `canPay` is not "status === open": the seller looking at their own open
 * request must see it as pending, not as a button.
 */
export type PaymentRequestState = {
  amountEtb: number
  status: "open" | "paid" | "stale"
  canPay: boolean
  /** One short line saying why it is not payable. Null when it is. */
  note: string | null
}

export type ThreadMessage = {
  id: string
  body: string
  author: MessageAuthor
  kind: MessageKind
  createdAt: string
  /** Present only on payment_request rows. */
  request: PaymentRequestState | null
}

/** A user is a buyer in some threads and a seller in others. */
export type ConversationRole = "buyer" | "seller"

export type ConversationSummary = {
  id: string
  role: ConversationRole
  /** The other person, by Telegram handle. Null for an account with no handle. */
  counterpart: string | null
  listing: {
    id: string
    slug: string
    title: string
    priceEtb: number | null
    imageUrl: string | null
    status: ListingStatus
  }
  lastMessage: string | null
  lastMessageAt: string
  unread: number
}

export type ConversationThread = ConversationSummary & {
  messages: ThreadMessage[]
  /**
   * Everything the in-thread deal rail needs, resolved for this viewer. Carried
   * on the thread rather than fetched by the rail so that one page render
   * produces one consistent answer — a rail that queried separately could show
   * "reserve this" beside a message saying the deposit already cleared.
   */
  depositEtb: number | null
  holdHours: number
  reservation: ReservationView | null
}

// --------------------------------------------------------------------------
// Reservations (Chapa hold)
// --------------------------------------------------------------------------

/** Mirrors db/schema/enums.ts reservationStatusEnum. */
export type ReservationStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "completed"
  | "refunded"

/**
 * A hold as the listing page renders it.
 *
 * `viewer` is what the copy keys off — the same paid hold reads as "you have
 * this until 4pm tomorrow" to the buyer, "someone has put a deposit down" to
 * the seller, and "reserved" to everyone else, and deciding that on the server
 * keeps the buyer's identity out of a stranger's page payload.
 */
export type ReservationView = {
  id: string
  status: ReservationStatus
  amountEtb: number
  expiresAt: string
  createdAt: string
  viewer: "buyer" | "seller" | "other"
  /** The other party's handle — only ever sent to the two participants. */
  counterpart: string | null
  /** Present while a hold is still `pending` and the buyer can resume it. */
  checkoutUrl: string | null
}

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "channels", label: "Seen in most channels" },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]["value"]

export type ListingQuery = {
  q?: string
  category?: string
  condition?: ListingCondition[]
  tier?: ListingTier[]
  area?: string
  minPrice?: number
  maxPrice?: number
  sort?: SortValue
  /** Display-only page counter for the "Page X of Y" label — never used to
   *  compute an offset. Incremented/decremented client-side when following a
   *  cursor link. */
  page?: number
  /** Opaque keyset cursor (base64), the actual pagination mechanism. */
  cursor?: string
}

export type ListingsPage = {
  items: Listing[]
  total: number
  page: number
  pageCount: number
  pageSize: number
  channelCount: number
  nextCursor: string | null
  prevCursor: string | null
}

/* -- Natural-language query parsing (see lib/search-parse.ts) --------------- */

/** The filter fields a sentence can set. `q` is excluded on purpose — it is the
 *  fallback rather than a parsed field, and it is never gated on confidence. */
export type ParsedFilterField =
  | "category"
  | "area"
  | "condition"
  | "minPrice"
  | "maxPrice"

/**
 * Where a parse came from. Surfaced in the response because it is the cheapest
 * honest answer to "did that cost an API call?" — `rules` and `cache` did not.
 */
export type ParseSource = "rules" | "llm" | "cache" | "mock" | "none"

/**
 * A filter we understood but were not confident enough to apply.
 *
 * The UI renders these as dashed, tappable chips beside the solid ones: solid
 * with an × is applied and removable, dashed with a + is offered and addable.
 * That difference is the entire user-visible payload of "confidence".
 */
export type QuerySuggestion = {
  field: ParsedFilterField
  /** Serialised exactly as it appears in the URL, so applying it is a plain set(). */
  value: string
  /** Display label. May contain Amharic — render it with `.type-mixed`. */
  label: string
  confidence: number
}

/**
 * Response of POST /api/search/parse.
 *
 * `confidence` is a sibling of `query`, never a field inside it: ListingQuery is
 * persisted verbatim into saved_searches.query, and a confidence score has no
 * business being stored in a saved search.
 *
 * This endpoint always answers 200. The client treats any non-2xx as "search is
 * broken" and drops the query, so a rate-limit or a model failure returns the
 * plain-keyword fallback with `source: "none"` rather than an error status.
 */
export type ParseResponse = {
  query: ListingQuery
  original: string
  confidence: Partial<Record<ParsedFilterField, number>>
  suggestions: QuerySuggestion[]
  source: ParseSource
}

/* -- Price fairness (see lib/price-stats.ts) -------------------------------- */

/** Which rung of the widening ladder produced the numbers. Surfaced for the
 *  same reason as PriceSuggestion.basis: an auditable range beats a magic one. */
export type PriceContextBasis =
  | "term+condition"
  | "term"
  | "category+condition"
  | "category"

/**
 * `outlier` is separate from `verdict` on purpose. `verdict: "above"` is a soft
 * signal (merely past p75) with no warning treatment; `outlier: "high"` is a
 * hard one. Only `outlier: "low"` earns the amber state.
 */
export type PriceOutlier = "low" | "high" | null

export type PriceContext = {
  listingId: string
  priceEtb: number
  basis: PriceContextBasis
  /** Human phrase for the comparison set, e.g. "lightly used iPhone". */
  bucketLabel: string
  categorySlug: string | null
  condition: ListingCondition | null
  sampleSize: number
  medianEtb: number
  p25Etb: number
  p75Etb: number
  lowFenceEtb: number
  highFenceEtb: number
  verdict: PriceVerdict
  outlier: PriceOutlier
  /** Signed, rounded percent difference from the median. */
  deltaFromMedianPct: number
  computedAt: string
}

/**
 * Response of GET /api/listings/[id]/price-context.
 *
 * A thin category is a designed outcome, not an error, so it answers 200 with
 * `available: false` — same reasoning as AutofillResponse's `{ ok: false }`.
 * `reason` is what makes the min-sample rule auditable from the outside.
 */
export type PriceContextResponse =
  | { available: true; context: PriceContext }
  | {
      available: false
      reason: "no_price" | "no_category" | "insufficient_sample"
    }

/* -- Native posting flow (see components/post) ------------------------------ */

/** Every field the posting form edits. All optional — the form starts empty
 *  when vision autofill fails, which is the designed fallback, not an error. */
export type PostFields = {
  titleEn: string
  titleAm: string
  descriptionEn: string
  categorySlug: string
  condition: ListingCondition | ""
  priceEtb: string
  negotiable: boolean
  locationArea: string
}

/**
 * A price suggestion derived from comparable listings already in the corpus —
 * never from the vision model. `basis` says how narrow the comparison was, and
 * is surfaced in the UI so the number is auditable rather than magic.
 */
export type PriceSuggestion = {
  suggestedEtb: number
  p25Etb: number
  p75Etb: number
  sampleSize: number
  basis: "category+condition" | "category"
}

/** Response of POST /api/listings/autofill. `ok: false` is the fallback path
 *  and is returned with HTTP 200 — the client just opens an empty form. */
export type AutofillResponse =
  | { ok: false }
  | {
      ok: true
      fields: Partial<PostFields>
      conditionReasoning: string | null
      confidence: number | null
      price: PriceSuggestion | null
    }

/** Persisted to localStorage so a half-finished listing survives a refresh. */
export type PostDraft = {
  imageKeys: string[]
  fields: PostFields
  conditionReasoning: string | null
  price: PriceSuggestion | null
}

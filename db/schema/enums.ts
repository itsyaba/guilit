import { pgEnum } from "drizzle-orm/pg-core"

/**
 * tier — the ladder every listing climbs.
 * indexed: scraped, unclaimed, contact routes back to Telegram.
 * claimed:  seller OTP-verified the phone number already in the listing.
 * native:  posted directly on our site; full feature set.
 */
export const tierEnum = pgEnum("tier", ["indexed", "claimed", "native"])

/**
 * condition — physical state of the item as extracted/reported.
 */
export const conditionEnum = pgEnum("condition", [
  "brand_new",
  "lightly_used",
  "fair",
])

/**
 * listing_status — lifecycle of a listing row.
 * Never hard-delete on removal requests; set status and keep the audit trail.
 */
export const listingStatusEnum = pgEnum("listing_status", [
  "queued",   // extraction complete, awaiting moderation
  "live",     // publicly visible
  "hidden",   // soft-hidden (3+ reports, or admin action)
  "removed",  // owner removal request — row stays, status changes
])

/**
 * job_status — state machine for the Postgres-native job queue.
 */
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "done",
  "failed",
])

/**
 * trust_level — gates what a user can do without moderator review.
 */
export const trustLevelEnum = pgEnum("trust_level", [
  "new",
  "established",
  "flagged",
])

/**
 * reservation_status — lifecycle of a Chapa-backed hold on an item.
 *
 * `paid` is the only state that actually reserves anything; everything after it
 * is how the hold ended. `completed` means the handover happened and the
 * deposit counted toward the price — it is not a refund, and the distinction
 * matters when a seller asks why money did or did not come back.
 */
export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",   // checkout opened, Chapa has not confirmed
  "paid",      // deposit held, item reserved for this buyer
  "failed",    // Chapa reported the charge failed
  "expired",   // hold window closed with no handover
  "cancelled", // buyer or seller withdrew before handover
  "completed", // handover happened, deposit went toward the price
  "refunded",  // deposit returned to the buyer
])

/**
 * message_kind — what a row in a thread actually is.
 *
 * Replaces an earlier `system` boolean. Once the platform can put more than one
 * kind of non-text object in a conversation, a boolean forces every reader to
 * guess which one it is holding from the body text, and a payment card rendered
 * from a guess is a payment card rendered wrong.
 *
 * text:            a person wrote it.
 * system:          the platform narrating something — a deposit clearing.
 * payment_request: the seller asking for a specific amount, with a Pay action.
 */
export const messageKindEnum = pgEnum("message_kind", [
  "text",
  "system",
  "payment_request",
])

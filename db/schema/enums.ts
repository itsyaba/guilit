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

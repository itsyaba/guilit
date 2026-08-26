import type { InferSelectModel, InferInsertModel } from "drizzle-orm"
import type {
  channels,
  rawMessages,
  extractions,
  listings,
  listingSources,
  images,
  users,
  categories,
  jobs,
  reports,
  ratings,
  savedSearches,
  searchParses,
  priceStats,
  otpCodes,
  rateLimitHits,
  moderationLogs,
  removalRequests,
  conversations,
  messages,
  reservations,
} from "./schema"

/**
 * DB select types — shapes returned when reading from the database.
 * Web components import the API response types from lib/types.ts instead;
 * these are for route handlers and server-side DB code.
 */
export type Channel = InferSelectModel<typeof channels>
export type RawMessage = InferSelectModel<typeof rawMessages>
export type Extraction = InferSelectModel<typeof extractions>
export type DbListing = InferSelectModel<typeof listings>
export type ListingSource = InferSelectModel<typeof listingSources>
export type Image = InferSelectModel<typeof images>
export type User = InferSelectModel<typeof users>
export type Category = InferSelectModel<typeof categories>
export type Job = InferSelectModel<typeof jobs>
export type Report = InferSelectModel<typeof reports>
export type Rating = InferSelectModel<typeof ratings>
export type SavedSearch = InferSelectModel<typeof savedSearches>
export type SearchParse = InferSelectModel<typeof searchParses>
export type PriceStatsRow = InferSelectModel<typeof priceStats>
export type OtpCode = InferSelectModel<typeof otpCodes>
export type RateLimitHit = InferSelectModel<typeof rateLimitHits>
export type ModerationLog = InferSelectModel<typeof moderationLogs>
export type RemovalRequest = InferSelectModel<typeof removalRequests>
export type DbConversation = InferSelectModel<typeof conversations>
export type DbMessage = InferSelectModel<typeof messages>
export type DbReservation = InferSelectModel<typeof reservations>

/**
 * DB insert types — shapes required when writing to the database.
 */
export type NewChannel = InferInsertModel<typeof channels>
export type NewRawMessage = InferInsertModel<typeof rawMessages>
export type NewExtraction = InferInsertModel<typeof extractions>
export type NewListing = InferInsertModel<typeof listings>
export type NewListingSource = InferInsertModel<typeof listingSources>
export type NewImage = InferInsertModel<typeof images>
export type NewUser = InferInsertModel<typeof users>
export type NewCategory = InferInsertModel<typeof categories>
export type NewJob = InferInsertModel<typeof jobs>
export type NewReport = InferInsertModel<typeof reports>
export type NewRating = InferInsertModel<typeof ratings>
export type NewSavedSearch = InferInsertModel<typeof savedSearches>
export type NewSearchParse = InferInsertModel<typeof searchParses>
export type NewPriceStatsRow = InferInsertModel<typeof priceStats>
export type NewOtpCode = InferInsertModel<typeof otpCodes>
export type NewRateLimitHit = InferInsertModel<typeof rateLimitHits>
export type NewModerationLog = InferInsertModel<typeof moderationLogs>
export type NewRemovalRequest = InferInsertModel<typeof removalRequests>
export type NewConversation = InferInsertModel<typeof conversations>
export type NewMessage = InferInsertModel<typeof messages>
export type NewReservation = InferInsertModel<typeof reservations>


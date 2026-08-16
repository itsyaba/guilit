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

import {
  pgTable,
  bigserial,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

/**
 * search_parses — cache of natural-language query parses.
 *
 * Same shape as the `extractions` table's (raw_message_id, prompt_version) key,
 * for the same reason: when the parser changes we want new rows under a new
 * version rather than silently-stale old ones, and bumping the version
 * invalidates everything without a DELETE.
 *
 * Keyed on a SHA-256 of the *normalised* query text (NFC, lowercased, Ethiopic
 * punctuation folded, whitespace collapsed) so "Laptop under 20k" and
 * "laptop  under  20k" are one cache entry and one API call. Normalisation
 * matters more than it looks for Amharic: Android IMEs emit different
 * compositions for canonically-equivalent sequences, so without NFC two
 * identical-looking queries are two entries and two calls.
 *
 * `hit_count` is deliberately load-bearing rather than decorative — it is how
 * we demonstrate "the same query twice costs one API call". It increments only
 * on a cache hit, and `source` records where the row was first materialised.
 *
 * No cleanup job, matching db/schema/rate-limit-hits.ts: rows are small and
 * cheap to leave, and LLM-sourced entries are aged out by the read predicate.
 */
export const searchParses = pgTable(
  "search_parses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** SHA-256 hex of the normalised query text. */
    queryHash: text("query_hash").notNull(),
    /**
     * Covers the deterministic rules AND the prompt, since rules-sourced rows
     * live in this same table — hence "parser", not "prompt", version.
     */
    parserVersion: text("parser_version").notNull(),
    /** Kept in plain text so the cache is debuggable and the eval script can read it. */
    normalizedQuery: text("normalized_query").notNull(),
    /** A serialised ParseResponse (lib/types.ts), minus `original`. */
    parsed: jsonb("parsed").notNull(),
    /** "rules" | "llm" | "mock" | "none" — where this row came from. */
    source: text("source").notNull(),
    latencyMs: integer("latency_ms"),
    hitCount: integer("hit_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastHitAt: timestamp("last_hit_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("search_parses_hash_version_uidx").on(t.queryHash, t.parserVersion),
    index("search_parses_last_hit_at_idx").on(t.lastHitAt),
  ]
)

import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

/**
 * search_synonyms — hand-curated Amharic ↔ Transliteration ↔ English synonym mapping table.
 *
 * Enables bidirectional cross-language discovery so that searching for:
 *   "sofa", "ሶፋ", or "soffa"
 *   "phone", "ስልክ", or "silk"
 *   "laptop", "ላፕቶፕ", "ኮምፒውተር", or "komputer"
 * expands into the identical canonical search term tokens before hitting
 * PostgreSQL FTS and trigram indexes.
 */
export const searchSynonyms = pgTable(
  "search_synonyms",
  {
    id: serial("id").primaryKey(),
    canonicalTerm: text("canonical_term").notNull(),
    synonym: text("synonym").notNull(),
    categorySlug: text("category_slug"),
    language: text("language").notNull().default("mixed"), // "en", "am", "translit"
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("search_synonyms_canonical_synonym_uidx").on(
      t.canonicalTerm,
      t.synonym
    ),
    index("search_synonyms_synonym_idx").on(t.synonym),
    index("search_synonyms_canonical_idx").on(t.canonicalTerm),
  ]
)

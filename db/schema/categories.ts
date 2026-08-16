import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * categories — bilingual category taxonomy.
 *
 * The slug is the stable identifier imported by both the web app and the
 * extraction pipeline. Changing a slug is a breaking change — prefer adding
 * new slugs and retiring old ones by removing listings from the old category.
 *
 * Self-referencing parent enables a two-level hierarchy (e.g. electronics →
 * phones) without adding complexity the current product needs.
 */
export const categories = pgTable("categories", {
  slug: text("slug").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameAm: text("name_am").notNull(),
  // Self-referencing FK — typed as any to break the circular reference
  parent: text("parent").references((): any => categories.slug),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

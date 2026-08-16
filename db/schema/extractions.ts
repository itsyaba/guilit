import {
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  real,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core"
import { rawMessages } from "./raw-messages"
import { conditionEnum } from "./enums"

/**
 * extractions — structured fields produced by the Gemini extraction pipeline.
 *
 * One extraction per (raw_message, prompt_version). When we retune the prompt
 * or add categories, we write new rows with the new prompt_version rather than
 * overwriting, which preserves the before/after comparison the moderator
 * dashboard needs.
 *
 * Phone numbers are normalised to +251... on write. PII is stripped from the
 * text sent to Gemini (replaced with [PHONE_1]) and reattached from here.
 */
export const extractions = pgTable(
  "extractions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rawMessageId: bigint("raw_message_id", { mode: "number" })
      .notNull()
      .references(() => rawMessages.id),
    promptVersion: text("prompt_version").notNull(),
    titleEn: text("title_en"),
    titleAm: text("title_am"),
    descriptionEn: text("description_en"),
    descriptionAm: text("description_am"),
    priceEtb: integer("price_etb"), // integer ETB; no floats, no currency column
    negotiable: boolean("negotiable"),
    categorySlug: text("category_slug"),
    condition: conditionEnum("condition"),
    locationArea: text("location_area"),
    locationCity: text("location_city").default("Addis Ababa"),
    phoneRaw: text("phone_raw"), // as extracted before normalisation
    phoneNormalized: text("phone_normalized"), // +251XXXXXXXXX
    confidenceScore: real("confidence_score").notNull(), // 0.0–1.0
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("extractions_raw_message_id_idx").on(t.rawMessageId),
    index("extractions_prompt_version_idx").on(t.promptVersion),
    index("extractions_confidence_idx").on(t.confidenceScore),
  ]
)

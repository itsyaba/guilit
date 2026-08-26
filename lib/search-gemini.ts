import type { Lexicon } from "@/lib/search-lexicon"
import type { RuleParse } from "@/lib/search-rules"
import { AREA_ALIASES } from "@/lib/search-lexicon"
import { isMockMode } from "@/lib/vision"
import type { ListingCondition } from "@/lib/types"

/**
 * The optional half of the query parser: Flash-Lite on whatever the
 * deterministic rules could not explain.
 *
 * Structurally a copy of lib/vision.ts — hand-rolled fetch, JSON response
 * schema built from live DB rows, model output re-validated against the
 * allow-list anyway, and every failure path returning null. The difference is
 * that this one is genuinely optional: the caller already holds a rules result
 * before it gets here, so a timeout costs latency and nothing else.
 *
 * Never called in mock mode, and never called when the rules left no residue.
 */

/** Do not guess a name here: a 404 returns null like any other failure, so a
 *  typo would ship a parser that looks like it works — the rules still fire —
 *  while this layer silently never runs. That is exactly what happened with the
 *  previous default, gemini-2.0-flash-lite, which Google shut down on
 *  2026-06-01; check the deprecation table before changing this. */
const DEFAULT_MODEL = "gemini-3.5-flash-lite"
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Sized against a 1.5s end-to-end budget over real mobile data: roughly 300ms
 * of round trip either side plus the work in the route leaves this much for the
 * model. Do not raise it to paper over a slow model — the whole point is that
 * the rules already answered.
 */
export const SEARCH_PARSE_TIMEOUT_MS = Number(
  process.env.SEARCH_PARSE_TIMEOUT_MS ?? 900
)

/** Capped below every deterministic confidence in lib/search-rules.ts, so a
 *  rule that fired always outranks the model on the same field. */
const MODEL_CONFIDENCE_CAP = 0.85

const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]

const PROMPT = `You convert a shopper's search phrase into marketplace filters for a used-goods site in Addis Ababa. The phrase may be Amharic, English, or both in one sentence.

Return filters ONLY for what the shopper actually said. Never guess a category to fill the field — omit it. Never invent a price.

CATEGORIES (choose one slug, or omit):
- "phones" (mobile phones, tablets, chargers, smartwatches)
- "computers" (laptops, desktops, monitors, printers, components)
- "furniture" (sofas, beds, tables, chairs, wardrobes)
- "appliances" (fridges, washing machines, microwaves, stoves, mitad)
- "tv-audio" (televisions, speakers, sound systems, headphones, consoles)
- "vehicles" (cars, motorcycles, bajaj, bicycles, parts)
- "fashion" (clothes, shoes, bags, jackets, watches, jewellery)
- "kids" (baby items, strollers, toys, kids clothes)
- "books" (textbooks, novels, stationery)
- "tools" (power tools, drills, generators, machinery)
- "electronics" (cameras, projectors, drones, routers, medical devices)
- "other" (anything else)

CONDITION: any that apply, or omit. brand_new (new/sealed/አዲስ), lightly_used (used/second hand/ንፁህ), fair (visibly worn/ያገለገለ).

AREA: an Addis neighbourhood spelled in English from the allowed list. Map Amharic spellings to the English name (ቦሌ becomes Bole).

PRICE: whole integers in ETB. "under/less than/በታች" sets max_price; "over/above/በላይ" sets min_price. "12k" and "12ሺ" both mean 12000. One number never sets both.

KEYWORDS: only words NOT already captured by category, area, condition or price — typically a brand or model such as "samsung a54". Leave empty when the category already says everything.

CONFIDENCE: one number from 0 to 1 per field you filled, meaning how sure you are the shopper actually asked for it. A field you inferred rather than read must be below 0.6.`

type ModelPayload = {
  category?: string
  category_confidence?: number
  min_price?: number
  max_price?: number
  price_confidence?: number
  condition?: string[]
  condition_confidence?: number
  area?: string
  area_confidence?: number
  keywords?: string
}

function buildSchema(categorySlugs: string[], areaNames: string[]) {
  return {
    type: "OBJECT",
    properties: {
      category: { type: "STRING", enum: categorySlugs },
      category_confidence: { type: "NUMBER" },
      min_price: { type: "INTEGER" },
      max_price: { type: "INTEGER" },
      price_confidence: { type: "NUMBER" },
      condition: { type: "ARRAY", items: { type: "STRING", enum: CONDITIONS } },
      condition_confidence: { type: "NUMBER" },
      area: { type: "STRING", enum: areaNames },
      area_confidence: { type: "NUMBER" },
      keywords: { type: "STRING" },
    },
    // Nothing is required — "omit the field" is the entire contract.
    required: [] as string[],
  }
}

function confidenceOf(raw: number | undefined, fallback = 0.6): number {
  const value = typeof raw === "number" && raw >= 0 && raw <= 1 ? raw : fallback
  return Math.min(value, MODEL_CONFIDENCE_CAP)
}

/**
 * Returns the model's reading of the phrase, or null. Callers merge this over a
 * rules result they already have — it is never the only answer.
 */
export async function parseWithModel(
  normalized: string,
  lexicon: Lexicon
): Promise<RuleParse | null> {
  if (isMockMode() || !normalized) return null

  const model = process.env.GEMINI_PARSE_MODEL || DEFAULT_MODEL
  const baseUrl = process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL
  const areaNames = [...new Set(Object.values(AREA_ALIASES))]

  try {
    const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PROMPT}\n\nSEARCH PHRASE: ${normalized}` }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: buildSchema(lexicon.categorySlugs, areaNames),
          // Extraction, not writing — and a deterministic answer keeps a cached
          // entry meaningful rather than a snapshot of one sampling.
          temperature: 0,
          maxOutputTokens: 256,
          // Flash-Lite already defaults to minimal thinking, but this budget is
          // 900ms — pinning it means a future default change cannot quietly
          // push every call past the ceiling the way it did in lib/vision.ts.
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
      signal: AbortSignal.timeout(SEARCH_PARSE_TIMEOUT_MS),
    })

    if (!response.ok) {
      console.error(
        `[search-parse] ${model} returned ${response.status}`,
        (await response.text().catch(() => "")).slice(0, 500)
      )
      return null
    }

    const body = await response.json()
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== "string") return null

    const parsed = JSON.parse(text) as ModelPayload
    const out: RuleParse = { residualTokens: [] }

    // Re-validated against the allow-lists even though the response schema
    // already constrained them, exactly as lib/vision.ts does.
    if (parsed.category && lexicon.categorySlugs.includes(parsed.category)) {
      out.category = {
        value: parsed.category,
        confidence: confidenceOf(parsed.category_confidence),
      }
    }

    if (parsed.area) {
      const canonical = AREA_ALIASES[parsed.area.trim().toLowerCase()]
      if (canonical) {
        out.area = {
          value: canonical,
          confidence: confidenceOf(parsed.area_confidence),
        }
      }
    }

    const conditions = (parsed.condition ?? []).filter(
      (c): c is ListingCondition => CONDITIONS.includes(c as ListingCondition)
    )
    if (conditions.length) {
      out.condition = {
        value: conditions,
        confidence: confidenceOf(parsed.condition_confidence),
      }
    }

    const priceConfidence = confidenceOf(parsed.price_confidence)
    const min = sanePrice(parsed.min_price)
    const max = sanePrice(parsed.max_price)
    if (min !== null && max !== null && min > max) {
      // Contradictory bounds are worse than none.
    } else {
      if (min !== null) out.minPrice = { value: min, confidence: priceConfidence }
      if (max !== null) out.maxPrice = { value: max, confidence: priceConfidence }
    }

    const keywords = (parsed.keywords ?? "").trim()
    if (keywords) out.q = keywords

    return out
  } catch (error) {
    // Timeout, network failure, malformed JSON — all the same to the caller.
    // Logged anyway: this layer is invisible by design, so a permanently broken
    // one leaves no other trace.
    console.error(`[search-parse] ${model} call failed`, error)
    return null
  }
}

function sanePrice(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= 50 && rounded <= 150_000_000 ? rounded : null
}

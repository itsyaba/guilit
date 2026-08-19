import type { ListingCondition, PostFields } from "@/lib/types"

/**
 * Vision autofill for native posts — photos in, draft listing fields out.
 *
 * Hand-rolled fetch rather than an SDK, mirroring ingest/extract/gemini_client.py
 * so the two callers share prompt conventions and mock behaviour. This is the
 * low-volume path (native posts only), which is what makes Flash affordable
 * here; the high-volume scrape pipeline stays on Flash-Lite text extraction.
 *
 * Contract: this never throws and never blocks past the timeout. Every failure
 * returns null, and the caller falls through to a plain manual form.
 */

const DEFAULT_MODEL = "gemini-3.6-flash"
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

/** Hard ceiling from the ticket. Past this we fall back, full stop. */
export const VISION_TIMEOUT_MS = Number(process.env.VISION_TIMEOUT_MS ?? 5000)

/** Two to three photos is plenty of signal and keeps the request small. */
export const MAX_VISION_PHOTOS = 3

const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]

const PROMPT = `You are helping someone list a second-hand item for sale on an Ethiopian marketplace (Addis Ababa). You are looking at photos of their item.

Return a listing draft. Rules:
- Describe ONLY what is visible in the photos. Do not invent a brand, model number, storage size, or accessory you cannot actually see.
- title_en: short and specific, the way a seller would write it. No marketing language.
- title_am: the same title in Amharic. Omit it if you are not confident.
- description_en: two or three plain sentences about what the item is and what a buyer can see in the photos.
- condition: judge from visible wear only.
  - brand_new: sealed, boxed, or with no visible use at all.
  - lightly_used: clean, minor cosmetic wear.
  - fair: visible scratches, scuffs, fading, or damage.
- condition_reasoning: one short sentence naming the specific visible detail that decided it, e.g. "scuffing on the left armrest". If the photos do not show enough to judge, say so plainly and choose "fair".
- Do NOT estimate a price. Price is computed separately from real comparable listings.`

export type VisionResult = {
  fields: Partial<PostFields>
  conditionReasoning: string | null
  confidence: number | null
}

export type VisionPhoto = { mimeType: string; base64: string }

/**
 * Mirrors gemini_client.py's is_mock_mode — no separate flag, the key value
 * itself decides. Keeps `make dev`, CI, and offline demo prep working.
 */
export function isMockMode(): boolean {
  const key = (process.env.GEMINI_API_KEY ?? "").trim().toLowerCase()
  return key === "" || key === "mock" || key === "none"
}

function mockResult(categorySlugs: string[]): VisionResult {
  return {
    fields: {
      titleEn: "Sample item from photos",
      descriptionEn:
        "Placeholder autofill — GEMINI_API_KEY is not set, so no vision call was made.",
      categorySlug: categorySlugs[0] ?? "",
      condition: "lightly_used",
    },
    conditionReasoning:
      "Mock mode: no photo was analysed, this is a fixed placeholder.",
    confidence: 0.5,
  }
}

function buildSchema(categorySlugs: string[]) {
  return {
    type: "OBJECT",
    properties: {
      title_en: { type: "STRING" },
      title_am: { type: "STRING" },
      description_en: { type: "STRING" },
      // Constrained to the live categories table — listings.category_slug is an
      // FK, so any slug outside this set would be rejected at insert.
      category_slug: { type: "STRING", enum: categorySlugs },
      condition: { type: "STRING", enum: CONDITIONS },
      condition_reasoning: { type: "STRING" },
      confidence: { type: "NUMBER" },
    },
    required: ["title_en", "category_slug", "condition", "condition_reasoning"],
  }
}

type GeminiPayload = {
  title_en?: string
  title_am?: string
  description_en?: string
  category_slug?: string
  condition?: string
  condition_reasoning?: string
  confidence?: number
}

export async function analyzePhotos(
  photos: VisionPhoto[],
  categorySlugs: string[]
): Promise<VisionResult | null> {
  if (!photos.length || !categorySlugs.length) return null
  if (isMockMode()) return mockResult(categorySlugs)

  const model = process.env.GEMINI_VISION_MODEL || DEFAULT_MODEL
  const baseUrl = process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL

  try {
    const response = await fetch(`${baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              ...photos.slice(0, MAX_VISION_PHOTOS).map((photo) => ({
                inline_data: { mime_type: photo.mimeType, data: photo.base64 },
              })),
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: buildSchema(categorySlugs),
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    })

    if (!response.ok) return null

    const body = await response.json()
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== "string") return null

    const parsed = JSON.parse(text) as GeminiPayload
    if (!parsed?.title_en) return null

    const condition = CONDITIONS.includes(parsed.condition as ListingCondition)
      ? (parsed.condition as ListingCondition)
      : ""
    const categorySlug = categorySlugs.includes(parsed.category_slug ?? "")
      ? (parsed.category_slug as string)
      : ""

    return {
      fields: {
        titleEn: parsed.title_en,
        titleAm: parsed.title_am ?? "",
        descriptionEn: parsed.description_en ?? "",
        categorySlug,
        condition,
      },
      conditionReasoning: parsed.condition_reasoning ?? null,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : null,
    }
  } catch {
    // Timeout, network failure, malformed JSON — all the same to the caller.
    return null
  }
}

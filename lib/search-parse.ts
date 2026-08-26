import { createHash } from "node:crypto"
import { and, eq, gt, sql } from "drizzle-orm"

import { db } from "@/db/client"
import { searchParses } from "@/db/schema"
import { getLexicon, type Lexicon } from "@/lib/search-lexicon"
import { runRules, type RuleField, type RuleParse } from "@/lib/search-rules"
import { isMockMode } from "@/lib/vision"
import { parseWithModel } from "@/lib/search-gemini"
import type {
  ListingCondition,
  ListingQuery,
  ParseResponse,
  ParsedFilterField,
  ParseSource,
  QuerySuggestion,
} from "@/lib/types"

/**
 * Natural language in, filter state out — the seam behind POST /api/search/parse.
 *
 * The order is deliberate: normalise, check the cache, run the deterministic
 * rules, and only then consider the model, on whatever the rules could not
 * explain. Most real queries never reach the model at all, which is what makes
 * "one call per query" true by construction rather than by accounting, and what
 * keeps the common case at a few milliseconds instead of a round trip to
 * Google. It also means mock mode and production behave identically for the
 * queries a demo actually types.
 *
 * Nothing here throws. The rules result exists before the model is consulted,
 * so a timeout or a malformed response costs latency and nothing else.
 */

/**
 * Bump to invalidate every cached parse. Covers the rules AND the prompt —
 * rules-sourced rows share the table, so "prompt version" would be a lie.
 */
export const PARSER_VERSION = "v1"

/** Enters `query` and is applied as a filter. */
const APPLY_THRESHOLD = 0.7
/** Offered as a tappable chip. Below this we say nothing — silence beats noise. */
const SUGGEST_THRESHOLD = 0.35

/** Longer than this is not a search phrase; it is a paste. */
const MAX_QUERY_CHARS = 200

/** A model-sourced parse is only as good as the prompt that produced it. */
const LLM_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60

const MEMO_LIMIT = 500

/**
 * Process-local tier in front of the table, mirroring the ExtractionCache /
 * extractions split in the ingest pipeline. Best-effort: Next re-evaluates the
 * module on HMR, and the durable answer is always Postgres.
 */
const memo = new Map<string, ParseResponse>()

const CONDITION_LABELS: Record<ListingCondition, string> = {
  brand_new: "Brand New",
  lightly_used: "Lightly Used",
  fair: "Fair Condition",
}

/**
 * Collapses the spellings of one intent onto one cache key.
 *
 * Wider than compute_content_hash in ingest/extract/caching.py, which only
 * collapses whitespace — that hashes seller messages, where case carries
 * meaning. Here "Laptop" and "laptop" are the same search and must not be two
 * API calls. NFC matters specifically for Amharic: Android keyboards emit
 * different compositions for canonically-equivalent sequences, so without it
 * two identical-looking queries miss each other in the cache.
 */
export function normalizeQuery(raw: string): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[​-‏﻿]/g, "")
    .replace(/ /g, " ")
    // Ethiopic wordspace and punctuation (፡ ። ፣ ፤ ፥ ፦ ፧ ፨) are separators.
    .replace(/[፡-፨]/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_CHARS)
}

function hashQuery(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex")
}

export type ParseOptions = {
  /**
   * Set false on paths that must not block on a network call — the browse page
   * reads suggestions for a shared link this way, and a cache miss there should
   * degrade to the rules rather than stall a render.
   */
  allowModel?: boolean
}

/**
 * The model earns a call only on the residue. Everything here is a reason the
 * rules already did the job, or a reason a call would be wasted.
 */
function shouldCallModel(parse: RuleParse, normalized: string): boolean {
  if (isMockMode()) return false
  if (normalized.length < 3) return false
  if (parse.residualTokens.length === 0) return false
  // A brand or model number left over is exactly what full-text search is for.
  if (parse.category && parse.residualTokens.length <= 1) return false
  return true
}

function fieldsFrom(parse: RuleParse) {
  return {
    category: parse.category,
    area: parse.area,
    condition: parse.condition,
    minPrice: parse.minPrice,
    maxPrice: parse.maxPrice,
  } satisfies Record<ParsedFilterField, RuleField<unknown> | undefined>
}

function labelFor(
  field: ParsedFilterField,
  value: unknown,
  lexicon: Lexicon
): string {
  switch (field) {
    case "category":
      return lexicon.categoryLabels.get(String(value))?.en ?? String(value)
    case "area":
      return String(value)
    case "condition":
      return (value as ListingCondition[])
        .map((c) => CONDITION_LABELS[c] ?? c)
        .join(", ")
    case "minPrice":
      return `Over ${Number(value).toLocaleString()} ETB`
    case "maxPrice":
      return `Under ${Number(value).toLocaleString()} ETB`
  }
}

function serialise(field: ParsedFilterField, value: unknown): string {
  return field === "condition"
    ? (value as ListingCondition[]).join(",")
    : String(value)
}

/**
 * Splits parsed fields into applied filters and offered suggestions.
 *
 * `q` is deliberately outside this: it is the degradation floor, never gated,
 * and it is what makes a failed parse behave as a plain keyword search.
 */
function assemble(
  parse: RuleParse,
  original: string,
  source: ParseSource,
  lexicon: Lexicon
): ParseResponse {
  const query: ListingQuery = {}
  const confidence: Partial<Record<ParsedFilterField, number>> = {}
  const suggestions: QuerySuggestion[] = []

  for (const [key, field] of Object.entries(fieldsFrom(parse))) {
    if (!field) continue
    const name = key as ParsedFilterField
    if (field.confidence >= APPLY_THRESHOLD) {
      switch (name) {
        case "category":
          query.category = field.value as string
          break
        case "area":
          query.area = field.value as string
          break
        case "condition":
          query.condition = field.value as ListingCondition[]
          break
        case "minPrice":
          query.minPrice = field.value as number
          break
        case "maxPrice":
          query.maxPrice = field.value as number
          break
      }
      confidence[name] = field.confidence
    } else if (field.confidence >= SUGGEST_THRESHOLD) {
      suggestions.push({
        field: name,
        value: serialise(name, field.value),
        label: labelFor(name, field.value, lexicon),
        confidence: field.confidence,
      })
    }
  }

  if (parse.q) query.q = parse.q

  // sort/page/cursor are never emitted: pinning a sort would silently override
  // one the shopper chose, and a cursor would end up persisted inside a saved
  // search. tier has no natural-language equivalent.
  return { query, original, confidence, suggestions, source }
}

/** Plain keyword search — the answer whenever anything at all goes wrong. */
function fallback(original: string): ParseResponse {
  const q = original.trim()
  return {
    query: q ? { q } : {},
    original,
    confidence: {},
    suggestions: [],
    source: "none",
  }
}

async function readCache(
  hash: string
): Promise<{ parsed: ParseResponse; source: ParseSource } | null> {
  const [row] = await db
    .select({ parsed: searchParses.parsed, source: searchParses.source })
    .from(searchParses)
    .where(
      and(
        eq(searchParses.queryHash, hash),
        eq(searchParses.parserVersion, PARSER_VERSION),
        // Deterministic rows never go stale; only a model answer ages out, and
        // it does so in the read predicate rather than needing a reaper.
        sql`(${searchParses.source} <> 'llm' OR ${searchParses.createdAt} > now() - ${sql.raw(
          `interval '${LLM_CACHE_TTL_SECONDS} seconds'`
        )})`
      )
    )
    .limit(1)

  if (!row) return null
  return {
    parsed: row.parsed as ParseResponse,
    source: row.source as ParseSource,
  }
}

async function writeCache(
  hash: string,
  normalized: string,
  response: ParseResponse,
  latencyMs: number
): Promise<void> {
  // Upsert, not insert: two tabs submitting the same phrase race to a 23505.
  await db
    .insert(searchParses)
    .values({
      queryHash: hash,
      parserVersion: PARSER_VERSION,
      normalizedQuery: normalized,
      parsed: response,
      source: response.source,
      latencyMs,
    })
    .onConflictDoUpdate({
      target: [searchParses.queryHash, searchParses.parserVersion],
      set: {
        hitCount: sql`${searchParses.hitCount} + 1`,
        lastHitAt: sql`now()`,
      },
    })
}

/** Records a cache hit. This counter is how we demonstrate that the same query
 *  twice costs one API call — it only ever increments on a hit. */
async function touchCache(hash: string): Promise<void> {
  await db
    .update(searchParses)
    .set({ hitCount: sql`${searchParses.hitCount} + 1`, lastHitAt: sql`now()` })
    .where(
      and(
        eq(searchParses.queryHash, hash),
        eq(searchParses.parserVersion, PARSER_VERSION),
        gt(searchParses.hitCount, 0)
      )
    )
}

export async function parseSearchQuery(
  raw: string,
  options: ParseOptions = {}
): Promise<ParseResponse> {
  const original = (raw ?? "").trim()
  const normalized = normalizeQuery(original)
  if (!normalized) return { ...fallback(original), source: "none" }

  const startedAt = Date.now()
  const hash = hashQuery(normalized)

  const hit = memo.get(hash)
  if (hit) {
    void touchCache(hash).catch(() => {})
    return { ...hit, original, source: "cache" }
  }

  try {
    const cached = await readCache(hash)
    if (cached) {
      memo.set(hash, cached.parsed)
      void touchCache(hash).catch(() => {})
      return { ...cached.parsed, original, source: "cache" }
    }

    const lexicon = await getLexicon()
    const parse = runRules(normalized, lexicon)
    let source: ParseSource = isMockMode() ? "mock" : "rules"

    if (options.allowModel !== false && shouldCallModel(parse, normalized)) {
      const model = await parseWithModel(normalized, lexicon)
      if (model) {
        mergeModelInto(parse, model)
        source = "llm"
      }
    }

    const response = assemble(parse, original, source, lexicon)

    if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string)
    memo.set(hash, response)
    await writeCache(hash, normalized, response, Date.now() - startedAt)
    return response
  } catch {
    // A parse is a convenience; a search is not. Never let this surface.
    return fallback(original)
  }
}

/**
 * Model output only fills gaps. A deterministic hit always wins, because the
 * model's confidence is capped below the rules' in lib/search-gemini.ts.
 */
function mergeModelInto(parse: RuleParse, model: RuleParse): void {
  const keys = ["category", "area", "condition", "minPrice", "maxPrice"] as const
  for (const key of keys) {
    const mine = parse[key]
    const theirs = model[key]
    if (!theirs) continue
    if (!mine || theirs.confidence > mine.confidence) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(parse as any)[key] = theirs
    }
  }
  // The rules' residual q is better than the model's, which tends to echo the
  // whole phrase back including words the filters already cover.
  if (!parse.q && model.q) parse.q = model.q
}

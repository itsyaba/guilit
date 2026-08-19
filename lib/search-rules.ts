import type { ListingCondition } from "@/lib/types"
import type { Lexicon } from "@/lib/search-lexicon"
import { AREA_ALIASES } from "@/lib/search-lexicon"

/**
 * The deterministic half of the query parser: a sentence in, filters out, with
 * no network and no database.
 *
 * This module is pure on purpose. It is the part that runs on every query, it
 * is what makes the common case cost nothing, and being IO-free is what lets a
 * script exercise it without a server. The LLM in lib/search-gemini.ts only
 * ever sees what these rules could not explain.
 *
 * Input must already be normalised — see normalizeQuery in lib/search-parse.ts.
 */

/** A parsed field plus how sure we are the shopper actually asked for it. */
export type RuleField<T> = { value: T; confidence: number }

export type RuleParse = {
  category?: RuleField<string>
  area?: RuleField<string>
  condition?: RuleField<ListingCondition[]>
  minPrice?: RuleField<number>
  maxPrice?: RuleField<number>
  /** Free-text remainder to hand to full-text search. */
  q?: string
  /** Tokens no rule could explain. Empty means the rules understood everything. */
  residualTokens: string[]
}

/* -- Confidence constants --------------------------------------------------
 * Rules are deterministic, so these are literals rather than a model's guess.
 * The number means "how sure are we the shopper asked for this", and anything
 * below APPLY_THRESHOLD in lib/search-parse.ts becomes a suggestion chip
 * instead of an applied filter.
 */
const CONF = {
  priceWithCurrency: 0.95,
  priceComparator: 0.85,
  /** A bare number is genuinely ambiguous: "laptop 20000" means "around", not
   *  "under". Guessing a ceiling here is the kind of quiet wrongness that makes
   *  a user stop trusting every other chip, so it is offered, never applied. */
  priceBare: 0.45,
  categoryName: 0.95,
  categorySynonym: 0.9,
  categoryConflict: 0.5,
  areaKnown: 0.9,
  /** Parsed correctly but no live listing stores that area, so applying it
   *  would produce a confidently empty page. */
  areaUnseen: 0.4,
  conditionExplicit: 0.9,
  /** Bare "used" sits between lightly_used and fair and we cannot tell which. */
  conditionVague: 0.55,
} as const

/**
 * Canonical terms that simply mean their category. When one of these picks the
 * category, it must not also go into `q`: our English titles say "Dell Latitude
 * 5420", never "laptop", so `q=laptop` would turn a correct parse into an empty
 * page. Every other canonical ("dell", "samsung", "sofa") narrows within a
 * category and is genuinely useful as a keyword.
 */
const CATEGORY_GENERIC_TERMS = new Set(["laptop", "phone", "car", "kids"])

const CONDITION_TERMS: Array<{
  value: ListingCondition
  confidence: number
  terms: string[]
}> = [
  {
    value: "brand_new",
    confidence: CONF.conditionExplicit,
    terms: ["brand new", "brand-new", "new in box", "sealed", "unopened", "unused", "አዲስ", "ያልተከፈተ"],
  },
  {
    value: "fair",
    confidence: CONF.conditionExplicit,
    terms: ["fair condition", "well used", "worn", "scratched", "መካከለኛ", "ያገለገለ"],
  },
  {
    value: "lightly_used",
    confidence: CONF.conditionExplicit,
    terms: ["lightly used", "gently used", "like new", "barely used", "ትንሽ የተሰራበት", "ንፁህ"],
  },
  {
    value: "lightly_used",
    confidence: CONF.conditionVague,
    terms: ["used", "second hand", "secondhand", "ሁለተኛ እጅ", "የተሰራበት"],
  },
]

/* -- Price grammar ---------------------------------------------------------
 * Ported from ingest/extract/regex_rules.py, which already knows how Ethiopian
 * sellers write money, plus the comparator layer that file has no need for.
 *
 * The load-bearing detail: English comparison is a prefix ("under 3000") while
 * Amharic is a circumfix — "ከ10000 በታች" is ከ(from) + number + በታች(below), with
 * the marker AFTER the amount. One regex cannot express both, so there are two
 * passes and the Amharic one runs first, because its trailing marker is the
 * stronger signal.
 */
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)`
// Longest alternatives first: "million" must win over "m", "ሺህ" over "ሺ".
const MULT = String.raw`(?:\s*(million|thousand|ሚሊዮን|ሺህ|mil|ሺ|ሽ|ሚ|k|m))?`
const CURR = String.raw`(?:\s*(ብር|birr|br|etb|\$))?`

const AM_MAX = new RegExp(`(?:ከ\\s*)?${NUM}${MULT}${CURR}\\s*(?:በታች|ስር|ያነሰ)`, "g")
const AM_MIN = new RegExp(`(?:ከ\\s*)?${NUM}${MULT}${CURR}\\s*(?:በላይ|የበለጠ)`, "g")
const EN_MAX = new RegExp(
  `(?:under|below|less than|up to|at most|cheaper than|no more than|not more than|within|max(?:imum)?)\\s*${NUM}${MULT}${CURR}`,
  "g"
)
const EN_MIN = new RegExp(
  `(?:over|above|more than|at least|starting at|starting from|min(?:imum)?)\\s*${NUM}${MULT}${CURR}`,
  "g"
)
const RANGE = new RegExp(
  `(?:between\\s*|ከ\\s*)?${NUM}${MULT}\\s*(?:-|–|—|to|and|እስከ)\\s*${NUM}${MULT}${CURR}`,
  "g"
)
const BARE = new RegExp(`(?<![\\w.,])${NUM}${MULT}${CURR}(?!\\w)`, "g")

const MULTIPLIERS: Record<string, number> = {
  k: 1000, thousand: 1000, "ሺ": 1000, "ሺህ": 1000, "ሽ": 1000,
  m: 1_000_000, mil: 1_000_000, million: 1_000_000,
  "ሚሊዮን": 1_000_000, "ሚ": 1_000_000,
}

/** Same clamp as the ingest regex rules: below 50 ETB nothing is for sale, and
 *  above 150M it is a phone number or a typo, not a price. */
function toAmount(num: string, mult?: string): number | null {
  const base = Number(num.replace(/,/g, ""))
  if (!Number.isFinite(base)) return null
  const value = Math.round(base * (mult ? (MULTIPLIERS[mult] ?? 1) : 1))
  return value >= 50 && value <= 150_000_000 ? value : null
}

type Span = { start: number; end: number }

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start)
}

type PriceResult = {
  minPrice?: RuleField<number>
  maxPrice?: RuleField<number>
  spans: Span[]
}

function parsePrices(text: string): PriceResult {
  const spans: Span[] = []
  const out: PriceResult = { spans }

  const take = (
    re: RegExp,
    handle: (m: RegExpExecArray) => boolean
  ): void => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (overlaps(spans, m.index, m.index + m[0].length)) continue
      if (handle(m)) spans.push({ start: m.index, end: m.index + m[0].length })
    }
  }

  // Ranges first, or "2000 to 8000" gets read as two unrelated ceilings.
  take(RANGE, (m) => {
    const lo = toAmount(m[1], m[2])
    const hi = toAmount(m[3], m[4])
    if (lo === null || hi === null || lo >= hi) return false
    // Without a currency word or a multiplier this shape is indistinguishable
    // from "iphone 13 to 15", so require amounts big enough to be money.
    if (!m[5] && !m[2] && !m[4] && (lo < 500 || hi < 500)) return false
    out.minPrice = { value: lo, confidence: m[5] ? CONF.priceWithCurrency : CONF.priceComparator }
    out.maxPrice = { value: hi, confidence: m[5] ? CONF.priceWithCurrency : CONF.priceComparator }
    return true
  })

  const bound = (
    re: RegExp,
    key: "minPrice" | "maxPrice"
  ): void =>
    take(re, (m) => {
      if (out[key]) return false
      const value = toAmount(m[1], m[2])
      if (value === null) return false
      out[key] = {
        value,
        confidence: m[3] ? CONF.priceWithCurrency : CONF.priceComparator,
      }
      return true
    })

  bound(AM_MAX, "maxPrice")
  bound(AM_MIN, "minPrice")
  bound(EN_MAX, "maxPrice")
  bound(EN_MIN, "minPrice")

  // A number with no comparator at all. Offered as a ceiling, never applied.
  take(BARE, (m) => {
    if (out.maxPrice || out.minPrice) return false
    const value = toAmount(m[1], m[2])
    if (value === null) return false
    const explicit = Boolean(m[2] || m[3])
    // Bare integers in a query are usually specs or model years, not budgets:
    // "128gb", "iphone 13", "toyota 2018", "55 inch".
    if (!explicit && (value < 500 || (value >= 1990 && value <= 2035))) return false
    out.maxPrice = {
      value,
      confidence: explicit ? CONF.priceComparator : CONF.priceBare,
    }
    return true
  })

  return out
}

/* -- Tokenisation ---------------------------------------------------------- */

/** Keeps Ethiopic (U+1200–U+137F) alongside \w, mirroring the tokeniser in
 *  ingest/search/synonyms.py so both sides split Amharic the same way. */
const TOKEN_RE = /[\wሀ-፿]+/g

const STOPWORDS = new Set([
  "i", "a", "an", "the", "want", "need", "looking", "for", "sale", "please",
  "in", "at", "on", "of", "me", "my", "some", "any", "good", "nice", "cheap",
  "birr", "etb", "br", "and", "or", "with",
  "ብር", "እፈልጋለሁ", "ይሸጣል", "ውስጥ", "አለ", "ያለው", "ጥሩ", "እና",
])

function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? []
}

/* -- The parser ------------------------------------------------------------ */

export function runRules(normalized: string, lexicon: Lexicon): RuleParse {
  const prices = parsePrices(normalized)

  // Blank out what the price grammar consumed so its digits and comparator
  // words cannot also be read as item keywords.
  let remaining = normalized
  for (const span of prices.spans) {
    remaining =
      remaining.slice(0, span.start) +
      " ".repeat(span.end - span.start) +
      remaining.slice(span.end)
  }

  const result: RuleParse = { residualTokens: [] }
  if (prices.minPrice) result.minPrice = prices.minPrice
  if (prices.maxPrice) result.maxPrice = prices.maxPrice

  // Area. Longest spelling wins so "shiro meda" beats a stray "meda".
  let areaMatch: { canonical: string; spelling: string } | null = null
  for (const [spelling, canonical] of Object.entries(AREA_ALIASES)) {
    if (!remaining.includes(spelling)) continue
    if (!areaMatch || spelling.length > areaMatch.spelling.length) {
      areaMatch = { canonical, spelling }
    }
  }
  if (areaMatch) {
    remaining = remaining.split(areaMatch.spelling).join(" ")
    // Re-validated against live data even though the gazetteer is curated —
    // the same belt-and-braces check lib/vision.ts applies to model output.
    const seen = lexicon.liveAreas.has(areaMatch.canonical.toLowerCase())
    result.area = {
      value: areaMatch.canonical,
      confidence: seen ? CONF.areaKnown : CONF.areaUnseen,
    }
  }

  // Condition. Longest phrase wins, so "brand new" beats "new".
  let conditionMatch: { value: ListingCondition; confidence: number; term: string } | null = null
  for (const group of CONDITION_TERMS) {
    for (const term of group.terms) {
      if (!remaining.includes(term)) continue
      if (!conditionMatch || term.length > conditionMatch.term.length) {
        conditionMatch = { value: group.value, confidence: group.confidence, term }
      }
    }
  }
  if (conditionMatch) {
    remaining = remaining.split(conditionMatch.term).join(" ")
    result.condition = {
      value: [conditionMatch.value],
      confidence: conditionMatch.confidence,
    }
  }

  // Category, from the synonym lexicon. n-grams longest-first so multi-word
  // synonyms ("የልብስ ማጠቢያ") win over their own parts.
  const tokens = tokenize(remaining)
  const consumed = new Array<boolean>(tokens.length).fill(false)
  const matched: Array<{ canonical: string; categorySlug: string | null; viaName: boolean }> = []

  for (let size = Math.min(lexicon.maxSynonymTokens, tokens.length); size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      if (consumed.slice(i, i + size).some(Boolean)) continue
      const phrase = tokens.slice(i, i + size).join(" ")
      const entry = lexicon.synonyms.get(phrase) ?? null
      const byName = lexicon.categoryNames.get(phrase) ?? null
      if (!entry && !byName) continue
      for (let j = i; j < i + size; j++) consumed[j] = true
      matched.push(
        entry
          ? { canonical: entry.canonicalTerm, categorySlug: entry.categorySlug, viaName: false }
          : { canonical: phrase, categorySlug: byName, viaName: true }
      )
    }
  }

  const slugCounts = new Map<string, number>()
  for (const m of matched) {
    if (m.categorySlug) {
      slugCounts.set(m.categorySlug, (slugCounts.get(m.categorySlug) ?? 0) + 1)
    }
  }

  let categorySetter: string | null = null
  if (slugCounts.size === 1) {
    const [slug] = [...slugCounts.keys()]
    const viaName = matched.some((m) => m.categorySlug === slug && m.viaName)
    result.category = {
      value: slug,
      confidence: viaName ? CONF.categoryName : CONF.categorySynonym,
    }
    categorySetter = slug
  } else if (slugCounts.size > 1) {
    // Two different categories in one phrase. Rather than pick, offer the
    // best-supported one and let the user tap it.
    const [slug] = [...slugCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    result.category = { value: slug, confidence: CONF.categoryConflict }
    categorySetter = slug
  }

  // Residual q: canonical forms of the matched synonyms (so an Amharic "ዴል"
  // reaches full-text search as "dell", which our English titles actually
  // contain), plus whatever no rule explained.
  const keywords: string[] = []
  for (const m of matched) {
    const generic =
      m.viaName ||
      (m.categorySlug === categorySetter && CATEGORY_GENERIC_TERMS.has(m.canonical))
    if (!generic) keywords.push(m.canonical.replace(/_/g, " "))
  }

  const residual = tokens.filter(
    (t, i) => !consumed[i] && !STOPWORDS.has(t) && t.length > 1
  )
  result.residualTokens = residual
  keywords.push(...residual)

  const q = [...new Set(keywords)].join(" ").trim()
  if (q) result.q = q

  return result
}

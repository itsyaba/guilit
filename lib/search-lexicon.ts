import { and, eq, isNotNull } from "drizzle-orm"

import { db } from "@/db/client"
import { categories, listings, searchSynonyms } from "@/db/schema"

/**
 * The vocabulary the deterministic query parser matches against.
 *
 * Two halves. The synonym and category maps are read from Postgres, because
 * search_synonyms is already the curated Amharic ↔ transliteration ↔ English
 * lexicon the ingest pipeline uses and duplicating it here would guarantee the
 * two drift. The area gazetteer is a static constant, because the live area
 * values are not clean enough to derive from — see AREA_ALIASES.
 *
 * Loaded once per process and memoised. This is a few hundred rows that change
 * when someone runs a seed command, so a request-time read would be pure waste;
 * `resetLexicon()` exists for the seed path and for scripts.
 */

/**
 * Every spelling we accept for an Addis area, mapped to the English canonical
 * that `listings.location_area` actually stores.
 *
 * Static rather than derived from getFilterOptions().areas, which is a
 * selectDistinct over live data — and that data is not clean: the corpus holds
 * both "Bole" and "ቦሌ" as separate values, and "Megenagna" appears only in
 * Amharic. Deriving the gazetteer from it would mean a correct parse of
 * "መገናኛ" produces a filter that matches nothing. Instead we map every spelling
 * to one canonical here, and lib/listings.ts widens the filter to match any
 * spelling of that canonical.
 */
export const AREA_ALIASES: Record<string, string> = {
  bole: "Bole", "ቦሌ": "Bole",
  piassa: "Piassa", piazza: "Piassa", "ፒያሳ": "Piassa",
  merkato: "Merkato", mercato: "Merkato", "መርካቶ": "Merkato",
  megenagna: "Megenagna", megenagn: "Megenagna", "መገናኛ": "Megenagna",
  sarbet: "Sarbet", "ሳርቤት": "Sarbet",
  cmc: "CMC", "ሲኤምሲ": "CMC",
  gerji: "Gerji", "ገርጂ": "Gerji",
  kazanchis: "Kazanchis", "ካዛንቺስ": "Kazanchis",
  ayat: "Ayat", "አያት": "Ayat",
  summit: "Summit", "ሰሚት": "Summit",
  lebu: "Lebu", "ለቡ": "Lebu",
  saris: "Saris", "ሳሪስ": "Saris",
  jemo: "Jemo", "ጀሞ": "Jemo",
  kolfe: "Kolfe", "ኮልፌ": "Kolfe",
  "shiro meda": "Shiro Meda", shiromeda: "Shiro Meda", "ሽሮ ሜዳ": "Shiro Meda",
  "arat kilo": "Arat Kilo", "4 kilo": "Arat Kilo", "አራት ኪሎ": "Arat Kilo",
  "gurd shola": "Gurd Shola", "ጉርድ ሾላ": "Gurd Shola",
  hayahulet: "Hayahulet", "22": "Hayahulet", "ሃያሁለት": "Hayahulet",
  kality: "Kality", "ቃሊቲ": "Kality",
  "old airport": "Old Airport", "ኦልድ ኤርፖርት": "Old Airport",
  "ayer tena": "Ayer Tena", "አየር ጤና": "Ayer Tena",
  torhailoch: "Torhailoch", "ቶር ሃይሎች": "Torhailoch",
  mexico: "Mexico", "ሜክሲኮ": "Mexico",
}

/** Canonical → every spelling of it, for widening an exact-match area filter. */
export const AREA_SPELLINGS: Record<string, string[]> = Object.entries(
  AREA_ALIASES
).reduce<Record<string, string[]>>((acc, [spelling, canonical]) => {
  ;(acc[canonical] ??= []).push(spelling)
  return acc
}, {})

/**
 * Every stored spelling that means the same place as `area`, including `area`
 * itself. Used to turn an exact `location_area = 'Megenagna'` filter into one
 * that also matches the rows stored as 'መገናኛ'.
 */
export function areaAliases(area: string): string[] {
  const canonical = AREA_ALIASES[area.trim().toLowerCase()] ?? area
  const spellings = AREA_SPELLINGS[canonical] ?? []
  // Title-cased variants are in the corpus too ("Cmc" from an old .title() call).
  const cased = spellings.map(
    (s) => s.charAt(0).toUpperCase() + s.slice(1)
  )
  return [...new Set([area, canonical, ...spellings, ...cased])]
}

export type SynonymEntry = {
  canonicalTerm: string
  categorySlug: string | null
}

export type Lexicon = {
  /** Category slugs currently in the categories table — the FK allow-list. */
  categorySlugs: string[]
  /** Lowercased category name (en and am) → slug. Covers the slugs that
   *  search_synonyms has no rows for, which today is books, other, electronics. */
  categoryNames: Map<string, string>
  /** slug → { en, am } for chip labels. */
  categoryLabels: Map<string, { en: string; am: string }>
  /** Lowercased synonym → canonical term + the category it implies. */
  synonyms: Map<string, SynonymEntry>
  /** The longest synonym, in tokens. Bounds the n-gram scan. */
  maxSynonymTokens: number
  /** Distinct location_area values on live listings, lowercased. */
  liveAreas: Set<string>
}

let cached: Promise<Lexicon> | null = null

export function resetLexicon(): void {
  cached = null
}

export function getLexicon(): Promise<Lexicon> {
  return (cached ??= loadLexicon())
}

async function loadLexicon(): Promise<Lexicon> {
  const [categoryRows, synonymRows, areaRows] = await Promise.all([
    db
      .select({
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameAm: categories.nameAm,
      })
      .from(categories),
    db
      .select({
        synonym: searchSynonyms.synonym,
        canonicalTerm: searchSynonyms.canonicalTerm,
        categorySlug: searchSynonyms.categorySlug,
      })
      .from(searchSynonyms),
    db
      .selectDistinct({ area: listings.locationArea })
      .from(listings)
      .where(
        and(eq(listings.status, "live"), isNotNull(listings.locationArea))
      ),
  ])

  const categoryNames = new Map<string, string>()
  const categoryLabels = new Map<string, { en: string; am: string }>()
  for (const row of categoryRows) {
    categoryLabels.set(row.slug, { en: row.nameEn, am: row.nameAm })
    categoryNames.set(row.nameEn.toLowerCase(), row.slug)
    categoryNames.set(row.nameAm.toLowerCase(), row.slug)
    categoryNames.set(row.slug.toLowerCase(), row.slug)
  }

  const synonyms = new Map<string, SynonymEntry>()
  let maxSynonymTokens = 1
  for (const row of synonymRows) {
    const key = row.synonym.trim().toLowerCase()
    if (!key) continue
    synonyms.set(key, {
      canonicalTerm: row.canonicalTerm,
      categorySlug: row.categorySlug,
    })
    maxSynonymTokens = Math.max(maxSynonymTokens, key.split(/\s+/).length)
  }

  const liveAreas = new Set(
    areaRows
      .map((r) => r.area?.trim().toLowerCase())
      .filter((a): a is string => Boolean(a))
  )

  return {
    categorySlugs: categoryRows.map((c) => c.slug),
    categoryNames,
    categoryLabels,
    synonyms,
    maxSynonymTokens,
    liveAreas,
  }
}

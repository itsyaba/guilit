import type { ParseResponse } from "@/lib/types"

/**
 * One typed sentence -> one browse URL.
 *
 * Split out of the input that collects the sentence because two surfaces share
 * it now -- the header field and the landing hero -- and "what does this phrase
 * mean" must not fork between them.
 *
 * The parsed query replaces filter state wholesale: "bag under 3000 birr"
 * re-derives the category and the ceiling, it does not add a keyword on top of
 * whatever was there before.
 */
export async function resolveSearchRoute(phrase: string): Promise<string> {
  const value = phrase.trim()
  if (!value) return "/browse"

  try {
    const res = await fetch("/api/search/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: value }),
      // The endpoint budgets well under this. If it is somehow slower, a plain
      // keyword search beats a spinner.
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) throw new Error("parse failed")

    const { query } = (await res.json()) as ParseResponse

    const search = new URLSearchParams()
    if (query.q) search.set("q", query.q)
    if (query.category) search.set("category", query.category)
    if (query.area) search.set("area", query.area)
    if (query.minPrice !== undefined)
      search.set("minPrice", String(query.minPrice))
    if (query.maxPrice !== undefined)
      search.set("maxPrice", String(query.maxPrice))
    for (const condition of query.condition ?? [])
      search.append("condition", condition)
    for (const tier of query.tier ?? []) search.append("tier", tier)

    return `/browse${search.toString() ? `?${search}` : ""}`
  } catch {
    // Timeout, offline, a bad response -- fall through to plain keyword search.
    // Degrading is the designed path, not an error state.
    return `/browse?q=${encodeURIComponent(value)}`
  }
}

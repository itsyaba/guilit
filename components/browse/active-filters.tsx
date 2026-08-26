"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconPlus, IconSearch, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { formatAmount } from "@/lib/format"
import type {
  FilterOptions,
  ListingQuery,
  ParsedFilterField,
  QuerySuggestion,
} from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The filters currently applied, and the ones we understood but weren't sure
 * enough to apply.
 *
 * This is the visible half of the query parser. A sentence like "bag under 3000
 * birr" lands here as two chips the shopper can read and correct by tapping —
 * which is the whole argument for parsing a sentence into filters rather than
 * running a conversation: they see what we understood, and fixing us costs one
 * tap instead of another round trip.
 *
 * Solid border with an × means applied and removable. Dashed border with a +
 * means offered and addable. That difference is the entire user-visible payload
 * of the parser's confidence scores.
 *
 * Every chip maps to a URL key that components/browse/filter-panel.tsx already
 * has a form control for. That is a constraint, not a coincidence: the panel
 * rebuilds the query string from its own form on submit and drops anything it
 * doesn't own, so a chip over a key the panel doesn't know would vanish the
 * moment someone pressed "Show results". In particular, suggestions must never
 * be written into the URL.
 */
export function ActiveFilters({
  query,
  options,
  suggestions = [],
  onEdit,
  className,
}: {
  query: ListingQuery
  options: FilterOptions
  suggestions?: QuerySuggestion[]
  /** Opens the filter drawer. Removal is one tap; adjusting a range isn't. */
  onEdit?: () => void
  className?: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  /** Deleting page and cursor is mandatory, not tidiness: pagination is keyset,
   *  so a cursor taken against the old filter set points at the wrong row. */
  function commit(mutate: (search: URLSearchParams) => void) {
    const search = new URLSearchParams(params.toString())
    mutate(search)
    search.delete("page")
    search.delete("cursor")
    router.push(search.toString() ? `/browse?${search}` : "/browse")
  }

  const remove = (key: string, value?: string) =>
    commit((search) => {
      if (value === undefined) {
        search.delete(key)
        return
      }
      const kept = search.getAll(key).filter((v) => v !== value)
      search.delete(key)
      for (const v of kept) search.append(key, v)
    })

  const apply = (field: ParsedFilterField, value: string) =>
    commit((search) => {
      if (field === "condition") {
        search.delete("condition")
        for (const v of value.split(",")) search.append("condition", v)
        return
      }
      search.set(field, value)
    })

  const categoryLabel = query.category
    ? (options.categories.find((c) => c.slug === query.category)?.label ??
      query.category)
    : null

  const conditionLabel = (value: string) =>
    options.conditions.find((c) => c.value === value)?.label ?? value

  const chips: Array<{
    key: string
    value?: string
    label: string
    icon?: React.ReactNode
  }> = []

  if (query.q) {
    chips.push({
      key: "q",
      label: `“${query.q}”`,
      icon: <IconSearch aria-hidden="true" className="size-3.5 shrink-0" />,
    })
  }
  if (query.category && categoryLabel) {
    chips.push({ key: "category", label: categoryLabel })
  }
  for (const value of query.condition ?? []) {
    chips.push({ key: "condition", value, label: conditionLabel(value) })
  }
  if (query.area) chips.push({ key: "area", label: query.area })
  if (query.minPrice !== undefined) {
    chips.push({
      key: "minPrice",
      label: `Over ${formatAmount(query.minPrice)} ETB`,
    })
  }
  if (query.maxPrice !== undefined) {
    chips.push({
      key: "maxPrice",
      label: `Under ${formatAmount(query.maxPrice)} ETB`,
    })
  }
  for (const value of query.tier ?? []) {
    const label = options.tiers.find((t) => t.value === value)?.label ?? value
    chips.push({ key: "tier", value, label })
  }

  // Never offer something already applied.
  const offered = suggestions.filter(
    (s) => !(s.field in query) || query[s.field] === undefined
  )

  if (!chips.length && !offered.length) return null

  return (
    <div className={cn("mb-7 flex flex-col gap-3", className)}>
      {chips.length ? (
        // Wraps rather than scrolling sideways: a chip pushed off-screen is a
        // filter the shopper cannot see to remove.
        <ul
          aria-label="Active filters"
          className="flex flex-wrap items-center gap-2"
        >
          {chips.map((chip) => (
            <li key={`${chip.key}:${chip.value ?? chip.label}`}>
              {/* Applied: solid pill, with the × in its own circle flush
                  against the pill's inner padding. */}
              <span
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full bg-card pr-1 pl-4 text-sm text-foreground",
                  "shadow-hairline ring-1 ring-hairline"
                )}
              >
                <button
                  type="button"
                  onClick={onEdit}
                  className="type-mixed inline-flex items-center gap-1.5 lg:pointer-events-none"
                >
                  {chip.icon}
                  {chip.label}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "size-8 rounded-full text-muted-foreground",
                    "transition-[color,background-color] duration-500 ease-fluid",
                    "hover:bg-tray hover:text-foreground"
                  )}
                  aria-label={`Remove ${chip.label} filter`}
                  onClick={() => remove(chip.key, chip.value)}
                >
                  <IconX aria-hidden="true" stroke={1.5} />
                </Button>
              </span>
            </li>
          ))}
          {chips.length > 1 ? (
            <li>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-10 rounded-full px-4 text-muted-foreground",
                  "transition-colors duration-500 ease-fluid hover:text-foreground"
                )}
                onClick={() => router.push("/browse")}
              >
                Clear all
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {offered.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-ledger text-muted-foreground">
            Did you mean
          </span>
          <ul
            aria-label="Suggested filters"
            className="flex flex-wrap items-center gap-2"
          >
            {offered.map((suggestion) => (
              <li key={`${suggestion.field}:${suggestion.value}`}>
                {/* Offered: dashed and unfilled, so "understood" and
                    "applied" are one glance apart. */}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-10 rounded-full border border-dashed border-border bg-transparent px-4",
                    "transition-colors duration-500 ease-fluid hover:bg-card"
                  )}
                  aria-label={`Add ${suggestion.label} filter`}
                  onClick={() => apply(suggestion.field, suggestion.value)}
                >
                  <IconPlus aria-hidden="true" stroke={1.5} />
                  <span className="type-mixed">{suggestion.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

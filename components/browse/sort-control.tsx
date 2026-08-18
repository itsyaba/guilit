"use client"

import { useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SORT_OPTIONS, type SortValue } from "@/lib/types"

/**
 * Sorting applies immediately -- there is nothing to confirm, and an extra tap
 * on a slow connection is a tap wasted.
 */
export function SortControl({ value }: { value: SortValue }) {
  const router = useRouter()
  const params = useSearchParams()

  function change(next: string) {
    const search = new URLSearchParams(params.toString())
    search.set("sort", next)
    search.delete("page")
    search.delete("cursor")
    router.push(`/browse?${search}`)
  }

  return (
    <Select
      items={SORT_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      value={value}
      onValueChange={(next) => change(String(next))}
    >
      <SelectTrigger
        aria-label="Sort results"
        className="h-9 rounded-lg border border-border bg-card px-3"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-lg">
        {SORT_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="rounded-md"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

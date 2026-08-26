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
import { cn } from "@/lib/utils"

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
        className={cn(
          "h-11 rounded-full border-0 bg-card px-5 text-sm ring-1 ring-hairline",
          "transition-shadow duration-500 ease-fluid hover:shadow-hairline"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-panel p-1.5 shadow-lift ring-1 ring-hairline">
        {SORT_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="rounded-xl"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

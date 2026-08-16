"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { formatAmount } from "@/lib/format"
import type { FilterOptions, ListingQuery } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The filter form.
 *
 * It is a real GET form first: without JavaScript it submits to /browse and the
 * server narrows the results. With JavaScript it routes client-side instead, so
 * the grid updates without a full reload on a slow connection.
 *
 * Checkboxes and radios are the native controls on purpose -- they are already
 * keyboard- and screen-reader-correct, they cost no JavaScript, and on Android
 * they get the platform's own touch target.
 */
export function FilterPanel({
  options,
  query,
  onApplied,
  className,
}: {
  options: FilterOptions
  query: ListingQuery
  onApplied?: () => void
  className?: string
}) {
  const router = useRouter()
  const { min, max } = options.priceBoundsEtb

  const [range, setRange] = React.useState<[number, number]>([
    query.minPrice ?? min,
    query.maxPrice ?? max,
  ])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const params = new URLSearchParams()

    for (const [key, value] of data.entries()) {
      const text = String(value).trim()
      if (!text) continue
      if (key === "minPrice" && Number(text) <= min) continue
      if (key === "maxPrice" && Number(text) >= max) continue
      params.append(key, text)
    }

    router.push(params.toString() ? `/browse?${params}` : "/browse")
    onApplied?.()
  }

  return (
    <form
      action="/browse"
      method="get"
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-7", className)}
    >
      {/* Free-text and sort survive a filter change rather than being reset. */}
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.sort ? <input type="hidden" name="sort" value={query.sort} /> : null}

      <Field label="Category">
        <NativeSelect name="category" defaultValue={query.category ?? ""}>
          <option value="">All categories</option>
          {options.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field
        label="Price"
        hint={`${formatAmount(range[0])} – ${
          range[1] >= max ? `${formatAmount(max)}+` : formatAmount(range[1])
        } ETB`}
      >
        <Slider
          value={range}
          min={min}
          max={max}
          step={500}
          onValueChange={(value) => setRange(value as [number, number])}
          aria-label="Price range in ETB"
          className="mt-3 mb-4"
        />
        <div className="flex items-center gap-2">
          <label className="flex-1">
            <span className="sr-only">Lowest price in ETB</span>
            <Input
              name="minPrice"
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={500}
              value={range[0]}
              onChange={(event) =>
                setRange(([, high]) => [Number(event.target.value), high])
              }
              className="h-9 rounded-lg border-border bg-card text-sm tabular-nums"
            />
          </label>
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <label className="flex-1">
            <span className="sr-only">Highest price in ETB</span>
            <Input
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={500}
              value={range[1]}
              onChange={(event) =>
                setRange(([low]) => [low, Number(event.target.value)])
              }
              className="h-9 rounded-lg border-border bg-card text-sm tabular-nums"
            />
          </label>
        </div>
      </Field>

      <Field label="Condition">
        <div className="space-y-2.5">
          {options.conditions.map((condition) => (
            <CheckLine
              key={condition.value}
              name="condition"
              value={condition.value}
              defaultChecked={query.condition?.includes(condition.value)}
            >
              {condition.label}
            </CheckLine>
          ))}
        </div>
      </Field>

      <Field
        label="Listing type"
        hint="Where the listing came from, not how good it is"
      >
        <div className="space-y-2.5">
          {options.tiers.map((tier) => (
            <CheckLine
              key={tier.value}
              name="tier"
              value={tier.value}
              defaultChecked={query.tier?.includes(tier.value)}
            >
              {tier.label}
            </CheckLine>
          ))}
        </div>
      </Field>

      <Field label="Area">
        <NativeSelect name="area" defaultValue={query.area ?? ""}>
          <option value="">Anywhere in Addis</option>
          {options.areas.map((area) => (
            <option key={area.area} value={area.area}>
              {area.area}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background pt-4 pb-1">
        <Button type="submit" size="lg" className="flex-1 rounded-lg">
          Show results
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="rounded-lg"
          onClick={() => {
            setRange([min, max])
            router.push("/browse")
            onApplied?.()
          }}
        >
          Clear
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <fieldset>
      <legend className="type-ledger mb-2 text-foreground">{label}</legend>
      {hint ? (
        <p className="mb-2 text-xs tabular-nums text-muted-foreground">{hint}</p>
      ) : null}
      {children}
    </fieldset>
  )
}

function CheckLine({
  name,
  value,
  defaultChecked,
  children,
}: {
  name: string
  value: string
  defaultChecked?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="size-4 shrink-0 rounded-sm border-border accent-primary"
      />
      {children}
    </label>
  )
}

/**
 * A styled native select. On Android this opens the platform picker, which is
 * both faster and more familiar than a rendered listbox on a cheap device.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {children}
    </select>
  )
}

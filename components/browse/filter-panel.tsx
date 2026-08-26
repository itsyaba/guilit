"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

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
 *
 * Fieldsets are separated by space and a hairline rather than by boxes. A panel
 * of five bordered cards inside a bordered panel is four borders too many, and
 * this whole form already sits inside a tray.
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
      className={cn("flex flex-col", className)}
    >
      {/* Free-text and sort survive a filter change rather than being reset. */}
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {query.sort ? (
        <input type="hidden" name="sort" value={query.sort} />
      ) : null}

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
          className="mt-4 mb-5"
        />
        <div className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Lowest price in ETB</span>
            <PriceInput
              name="minPrice"
              min={min}
              max={max}
              value={range[0]}
              onChange={(next) => setRange(([, high]) => [next, high])}
            />
          </label>
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Highest price in ETB</span>
            <PriceInput
              name="maxPrice"
              min={min}
              max={max}
              value={range[1]}
              onChange={(next) => setRange(([low]) => [low, next])}
            />
          </label>
        </div>
      </Field>

      <Field label="Condition">
        <div className="space-y-1">
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
        <div className="space-y-1">
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

      <Field label="Area" last>
        <NativeSelect name="area" defaultValue={query.area ?? ""}>
          <option value="">Anywhere in Addis</option>
          {options.areas.map((area) => (
            <option key={area.area} value={area.area}>
              {area.area}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {/*
       * The submit row is sticky against the bottom of whichever container is
       * scrolling -- the sidebar's own overflow on desktop, the drawer body on
       * a phone -- so "Show results" is never below the fold of a form with
       * twelve areas in it. The gradient is what stops a checkbox from
       * appearing to sit on top of the button as it scrolls under.
       */}
      <div className="sticky bottom-0 -mx-1 mt-6 flex gap-2 bg-gradient-to-t from-card via-card to-transparent px-1 pt-6 pb-1">
        <button
          type="submit"
          className={cn(
            "group/apply inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full",
            "bg-primary px-5 text-sm font-medium text-primary-foreground shadow-ambient",
            "transition-[transform,box-shadow] duration-500 ease-fluid",
            "hover:shadow-lift active:scale-[0.985]",
            "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
          )}
        >
          Show results
        </button>
        <button
          type="button"
          onClick={() => {
            setRange([min, max])
            router.push("/browse")
            onApplied?.()
          }}
          className={cn(
            "inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-card px-5",
            "text-sm font-medium text-muted-foreground ring-1 ring-hairline",
            "transition-[color,box-shadow] duration-500 ease-fluid",
            "hover:text-foreground hover:shadow-hairline",
            "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
          )}
        >
          Clear
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  last = false,
  children,
}: {
  label: string
  hint?: string
  /** Drops the closing rule, so the last group does not draw one into the
   *  submit row's gradient. */
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <fieldset
      className={cn(
        "min-w-0 py-6 first:pt-0",
        !last && "border-b border-hairline"
      )}
    >
      <legend className="type-ledger text-foreground">{label}</legend>
      {hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
          {hint}
        </p>
      ) : (
        <div className="h-3" />
      )}
      {children}
    </fieldset>
  )
}

/**
 * One condition or tier. The whole row is the target, and it lights up as a
 * tray on hover so a fat thumb has something to aim at that is bigger than a
 * 16px box.
 */
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
    <label
      className={cn(
        "-mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-foreground",
        "transition-colors duration-500 ease-fluid hover:bg-tray"
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="size-4 shrink-0 rounded-sm border-hairline accent-primary"
      />
      {children}
    </label>
  )
}

/** The two numeric bounds. Controlled, because the slider writes them too. */
function PriceInput({
  name,
  min,
  max,
  value,
  onChange,
}: {
  name: string
  min: number
  max: number
  value: number
  onChange: (next: number) => void
}) {
  return (
    <Input
      name={name}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={500}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={cn(
        "h-10 rounded-full border-0 bg-tray px-4 text-sm tabular-nums ring-1 ring-hairline",
        "transition-shadow duration-500 ease-fluid focus-visible:shadow-hairline"
      )}
    />
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
        "h-10 w-full rounded-full bg-tray px-4 text-sm text-foreground ring-1 ring-hairline",
        "transition-shadow duration-500 ease-fluid hover:shadow-hairline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      {children}
    </select>
  )
}

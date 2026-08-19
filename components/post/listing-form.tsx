"use client"

import * as React from "react"
import { IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { dismissReasoning, isReasoningDismissed } from "@/lib/post-draft"
import type {
  CategoryOption,
  ConditionOption,
  PostFields,
  PriceSuggestion,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const CONDITION_FALLBACK: ConditionOption[] = [
  { value: "brand_new", label: "Brand new", labelAm: "አዲስ" },
  { value: "lightly_used", label: "Lightly used", labelAm: "ትንሽ ያገለገለ" },
  { value: "fair", label: "Fair", labelAm: "መካከለኛ" },
]

const FIELD_LABEL = "block text-sm font-medium text-foreground"
const HELP = "text-xs text-muted-foreground"

/**
 * The confirm step. Every field is editable and enabled, including the price —
 * the model and the comparables corpus suggest, the seller decides.
 */
export function ListingForm({
  fields,
  onChange,
  categories,
  conditions,
  areas,
  price,
  conditionReasoning,
  onSubmit,
  pending,
  error,
}: {
  fields: PostFields
  onChange: (next: Partial<PostFields>) => void
  categories: CategoryOption[]
  conditions: ConditionOption[]
  areas: string[]
  price: PriceSuggestion | null
  conditionReasoning: string | null
  onSubmit: () => void
  pending: boolean
  error: string | null
}) {
  const [reasoningHidden, setReasoningHidden] = React.useState(true)

  // localStorage is unavailable during SSR; read it after mount so the markup
  // matches on both sides.
  React.useEffect(() => {
    setReasoningHidden(isReasoningDismissed())
  }, [])

  const conditionOptions = conditions.length ? conditions : CONDITION_FALLBACK
  const showReasoning = !!conditionReasoning && !reasoningHidden

  function hideReasoning() {
    dismissReasoning()
    setReasoningHidden(true)
  }

  const canSubmit =
    !pending && !!fields.titleEn.trim() && !!fields.categorySlug && !!fields.condition

  return (
    <form
      className="space-y-5 pb-24"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="space-y-1.5">
        <label className={FIELD_LABEL} htmlFor="post-title">
          Title
        </label>
        <Input
          id="post-title"
          value={fields.titleEn}
          onChange={(event) => onChange({ titleEn: event.target.value })}
          maxLength={140}
          placeholder="e.g. Samsung Galaxy A54, 128GB"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className={FIELD_LABEL} htmlFor="post-title-am">
          Title in Amharic <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="post-title-am"
          value={fields.titleAm}
          onChange={(event) => onChange({ titleAm: event.target.value })}
          maxLength={140}
        />
      </div>

      <div className="space-y-1.5">
        <label className={FIELD_LABEL} htmlFor="post-description">
          Description
        </label>
        <textarea
          id="post-description"
          value={fields.descriptionEn}
          onChange={(event) => onChange({ descriptionEn: event.target.value })}
          maxLength={2000}
          rows={5}
          className="flex w-full rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          placeholder="What's included, how long you've had it, anything a buyer should know."
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={FIELD_LABEL} htmlFor="post-category">
            Category
          </label>
          {/* Native select: a one-tap wheel on mobile, and it can't get stuck
              open behind the sticky action bar the way a popover can. */}
          <select
            id="post-category"
            value={fields.categorySlug}
            onChange={(event) => onChange({ categorySlug: event.target.value })}
            required
            className="h-9 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={FIELD_LABEL} htmlFor="post-condition">
            Condition
          </label>
          <select
            id="post-condition"
            value={fields.condition}
            onChange={(event) => {
              onChange({ condition: event.target.value as PostFields["condition"] })
              // Once the seller overrides it, the model's rationale is stale.
              hideReasoning()
            }}
            required
            className="h-9 w-full rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="">Choose a condition</option>
            {conditionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {showReasoning ? (
            <div className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <p className={cn(HELP, "flex-1")}>
                We suggested this from your photos: {conditionReasoning} Change it
                if that's not right.
              </p>
              <button
                type="button"
                onClick={hideReasoning}
                aria-label="Dismiss suggestion"
                className="text-muted-foreground hover:text-foreground"
              >
                <IconX className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={FIELD_LABEL} htmlFor="post-price">
            Price (ETB)
          </label>
          <Input
            id="post-price"
            value={fields.priceEtb}
            onChange={(event) =>
              onChange({ priceEtb: event.target.value.replace(/[^0-9]/g, "") })
            }
            inputMode="numeric"
            placeholder="Leave blank to discuss"
          />
          {price ? (
            <p className={HELP}>
              Similar listings sell around{" "}
              <strong className="font-medium text-foreground">
                {price.suggestedEtb.toLocaleString()} ETB
              </strong>{" "}
              ({price.p25Etb.toLocaleString()}–{price.p75Etb.toLocaleString()}) ·{" "}
              {price.sampleSize} comparable{price.sampleSize === 1 ? "" : "s"}
              {price.basis === "category" ? " in this category" : ""}
            </p>
          ) : null}
          <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
            <input
              type="checkbox"
              checked={fields.negotiable}
              onChange={(event) => onChange({ negotiable: event.target.checked })}
              className="size-4 accent-primary"
            />
            Price is negotiable
          </label>
        </div>

        <div className="space-y-1.5">
          <label className={FIELD_LABEL} htmlFor="post-area">
            Area
          </label>
          <Input
            id="post-area"
            value={fields.locationArea}
            onChange={(event) => onChange({ locationArea: event.target.value })}
            list="post-area-options"
            placeholder="e.g. Bole"
          />
          <datalist id="post-area-options">
            {areas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-end">
          <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
            {pending ? "Posting…" : "Post listing"}
          </Button>
        </div>
      </div>
    </form>
  )
}

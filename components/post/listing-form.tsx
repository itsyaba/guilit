"use client"

import * as React from "react"
import { IconSparkles, IconX } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
import { Input } from "@/components/ui/input"
import {
  dismissReasoning,
  isReasoningDismissed,
  isReasoningDismissedOnServer,
  subscribeReasoningDismissed,
} from "@/lib/post-draft"
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

/** One control's shape, in one place: pill, recessed, hairlined. */
const CONTROL = cn(
  "h-11 w-full rounded-full border-0 bg-tray px-4 text-sm text-foreground ring-1 ring-hairline",
  "placeholder:text-muted-foreground/70",
  "transition-shadow duration-500 ease-fluid",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
)

const FIELD_LABEL = "block text-sm font-medium text-foreground"
const HELP = "text-xs leading-relaxed text-muted-foreground"

/**
 * The confirm step.
 *
 * Three panels rather than one long column of inputs: what it is, what it's
 * like, what it costs. A seller who opened this from a photo is checking work
 * that is already done, and grouping is what makes "already done" scannable —
 * you read three headings, not eight labels.
 *
 * Every field is editable and enabled, including the price. The model and the
 * comparables corpus suggest; the seller decides.
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
  // localStorage is unavailable during SSR, so this is read through an external
  // store rather than a mount effect: the server snapshot reports "hidden", the
  // client re-reads after hydration, and dismissReasoning() notifies.
  const reasoningHidden = React.useSyncExternalStore(
    subscribeReasoningDismissed,
    isReasoningDismissed,
    isReasoningDismissedOnServer
  )

  const conditionOptions = conditions.length ? conditions : CONDITION_FALLBACK
  const showReasoning = !!conditionReasoning && !reasoningHidden

  function hideReasoning() {
    dismissReasoning()
  }

  const canSubmit =
    !pending &&
    !!fields.titleEn.trim() &&
    !!fields.categorySlug &&
    !!fields.condition

  return (
    <form
      className="space-y-4 pb-28"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Shell coreClassName="space-y-5 p-6">
        <Eyebrow tone="quiet">What it is</Eyebrow>

        <div className="space-y-2">
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
            className={CONTROL}
          />
        </div>

        <div className="space-y-2">
          <label className={FIELD_LABEL} htmlFor="post-title-am">
            Title in Amharic{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </label>
          <Input
            id="post-title-am"
            lang="am"
            value={fields.titleAm}
            onChange={(event) => onChange({ titleAm: event.target.value })}
            maxLength={140}
            className={CONTROL}
          />
          <p className={HELP}>
            Buyers search in both. An Amharic title roughly doubles who finds
            this.
          </p>
        </div>

        <div className="space-y-2">
          <label className={FIELD_LABEL} htmlFor="post-description">
            Description
          </label>
          <textarea
            id="post-description"
            value={fields.descriptionEn}
            onChange={(event) =>
              onChange({ descriptionEn: event.target.value })
            }
            maxLength={2000}
            rows={5}
            placeholder="What's included, how long you've had it, anything a buyer should know."
            className={cn(
              "w-full rounded-panel bg-tray px-4 py-3 text-sm text-foreground ring-1 ring-hairline",
              "placeholder:text-muted-foreground/70",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          />
        </div>
      </Shell>

      <Shell coreClassName="space-y-5 p-6">
        <Eyebrow tone="quiet">Condition and place</Eyebrow>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className={FIELD_LABEL} htmlFor="post-category">
              Category
            </label>
            {/* Native select: a one-tap wheel on mobile, and it can't get stuck
                open behind the sticky action bar the way a popover can. */}
            <select
              id="post-category"
              value={fields.categorySlug}
              onChange={(event) =>
                onChange({ categorySlug: event.target.value })
              }
              required
              className={CONTROL}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={FIELD_LABEL} htmlFor="post-condition">
              Condition
            </label>
            <select
              id="post-condition"
              value={fields.condition}
              onChange={(event) => {
                onChange({
                  condition: event.target.value as PostFields["condition"],
                })
                // Once the seller overrides it, the model's rationale is stale.
                hideReasoning()
              }}
              required
              className={CONTROL}
            >
              <option value="">Choose a condition</option>
              {conditionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showReasoning ? (
          /* Marked as ours, not as fact: the accent tint and the label are what
             separate "we guessed this from your photo" from what the seller
             typed themselves. */
          <div className="flex items-start gap-3 rounded-tile bg-primary/8 p-4 ring-1 ring-hairline">
            <IconSparkles
              aria-hidden="true"
              stroke={1.5}
              className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <div className="min-w-0 flex-1">
              <p className="type-ledger text-muted-foreground">
                From your photos
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                {conditionReasoning}{" "}
                <span className="text-muted-foreground">
                  Change it if that&rsquo;s not right.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={hideReasoning}
              aria-label="Dismiss suggestion"
              className={cn(
                "-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground",
                "transition-colors duration-500 ease-fluid hover:bg-card hover:text-foreground"
              )}
            >
              <IconX aria-hidden="true" stroke={1.5} className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className={FIELD_LABEL} htmlFor="post-area">
            Area
          </label>
          <Input
            id="post-area"
            value={fields.locationArea}
            onChange={(event) => onChange({ locationArea: event.target.value })}
            list="post-area-options"
            placeholder="e.g. Bole"
            className={CONTROL}
          />
          <datalist id="post-area-options">
            {areas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </div>
      </Shell>

      <Shell coreClassName="space-y-5 p-6">
        <Eyebrow tone="quiet">Price</Eyebrow>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
          <div className="space-y-2">
            <label className={FIELD_LABEL} htmlFor="post-price">
              Asking price (ETB)
            </label>
            <Input
              id="post-price"
              value={fields.priceEtb}
              onChange={(event) =>
                onChange({
                  priceEtb: event.target.value.replace(/[^0-9]/g, ""),
                })
              }
              inputMode="numeric"
              placeholder="Leave blank to discuss"
              className={cn(CONTROL, "tabular-nums")}
            />
            <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-sm text-foreground">
              <input
                type="checkbox"
                checked={fields.negotiable}
                onChange={(event) =>
                  onChange({ negotiable: event.target.checked })
                }
                className="size-4 rounded-sm border-hairline accent-primary"
              />
              Price is negotiable
            </label>
          </div>

          {/* The comparables, shown as a figure rather than a sentence: it is
              the one number on this page the seller is being asked to judge
              their own against. */}
          {price ? (
            <div className="rounded-tile bg-tray p-4 ring-1 ring-hairline">
              <p className="type-ledger text-muted-foreground">
                Similar items sell around
              </p>
              <p className="type-figure type-display mt-2 text-2xl text-foreground">
                {price.suggestedEtb.toLocaleString()}{" "}
                <span className="type-ledger text-muted-foreground">ETB</span>
              </p>
              <p className={cn(HELP, "mt-2")}>
                Most land between {price.p25Etb.toLocaleString()} and{" "}
                {price.p75Etb.toLocaleString()} ETB, from {price.sampleSize}{" "}
                comparable{price.sampleSize === 1 ? "" : "s"}
                {price.basis === "category" ? " in this category" : ""}.
              </p>
            </div>
          ) : null}
        </div>
      </Shell>

      {error ? (
        <p className="rounded-tile bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          {error}
        </p>
      ) : null}

      {/*
       * The dock. Fixed rather than in-flow because the form is longer than a
       * phone screen and "Post" must never be something you scroll to find; a
       * floating pill rather than a full-width bar because a rule across the
       * bottom of the viewport cuts the page in half. `backdrop-blur` is
       * affordable here for the same reason it is on the header: fixed element,
       * own compositor layer, nothing scrolling underneath it re-blurs.
       */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-6">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 rounded-full bg-card/85 p-2 pl-5 shadow-lift ring-1 ring-hairline backdrop-blur supports-backdrop-filter:bg-card/70">
          <p className="type-ledger min-w-0 flex-1 truncate text-muted-foreground">
            {canSubmit
              ? "Ready to post"
              : "Title, category and condition are needed"}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-6",
              "text-sm font-medium text-primary-foreground shadow-ambient",
              "transition-[transform,box-shadow] duration-500 ease-fluid",
              "hover:shadow-lift active:scale-[0.985]",
              "disabled:pointer-events-none disabled:opacity-45",
              "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            )}
          >
            {pending ? "Posting…" : "Post listing"}
          </button>
        </div>
      </div>
    </form>
  )
}

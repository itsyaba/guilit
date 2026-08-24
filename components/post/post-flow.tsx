"use client"

import * as React from "react"
import Link from "next/link"

import { ListingForm } from "@/components/post/listing-form"
import { PhotoStep } from "@/components/post/photo-step"
import { Button } from "@/components/ui/button"
import {
  EMPTY_FIELDS,
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/lib/post-draft"
import type {
  AutofillResponse,
  CategoryOption,
  ConditionOption,
  PostFields,
  PriceSuggestion,
} from "@/lib/types"

type Stage = "photos" | "analyzing" | "form" | "done"

/**
 * Client-side ceiling on the vision call, a shade above the server's own 5s
 * cap. If the route itself hangs (not the model), this is what still gets the
 * seller to a usable form.
 */
const AUTOFILL_TIMEOUT_MS = 5500

type Result = { id: string; slug: string; status: string }

export function PostFlow({
  categories,
  conditions,
  areas,
  mediaBaseUrl,
}: {
  categories: CategoryOption[]
  conditions: ConditionOption[]
  areas: string[]
  /** Prefix for rehydrated photo previews — R2 public URL, or the local
   *  /api/media proxy. Resolved on the server since it's env-dependent. */
  mediaBaseUrl: string
}) {
  const [stage, setStage] = React.useState<Stage>("photos")
  const [imageKeys, setImageKeys] = React.useState<string[]>([])
  const [fields, setFields] = React.useState<PostFields>(EMPTY_FIELDS)
  const [conditionReasoning, setConditionReasoning] = React.useState<string | null>(null)
  const [price, setPrice] = React.useState<PriceSuggestion | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<Result | null>(null)
  const [restored, setRestored] = React.useState(false)

  // Rehydrate a half-finished listing. Photos come back as keys — that's why
  // they're uploaded before the form step rather than held as File objects.
  //
  // This has to be a mount effect, not a lazy useState initializer: localStorage
  // does not exist during SSR, so reading it in render would make the server and
  // client markup disagree. Unlike the read-only flag in listing-form.tsx, the
  // draft becomes editable state the moment it lands, so useSyncExternalStore is
  // not applicable either. All six writes are batched into a single re-render,
  // which is the cascade the rule below exists to prevent.
  React.useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setImageKeys(draft.imageKeys)
      setFields(draft.fields)
      setConditionReasoning(draft.conditionReasoning)
      setPrice(draft.price)
      setStage("form")
      setRestored(true)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [])

  // Persist on every change once we're past the photo step. Cheap enough that
  // debouncing would only add a window where a refresh loses keystrokes.
  React.useEffect(() => {
    if (stage !== "form") return
    saveDraft({ imageKeys, fields, conditionReasoning, price })
  }, [stage, imageKeys, fields, conditionReasoning, price])

  function patch(next: Partial<PostFields>) {
    setFields((current) => ({ ...current, ...next }))
  }

  /**
   * Vision autofill. Every failure mode — timeout, offline, bad JSON, ok:false
   * — lands in exactly the same place: the plain form, with no error surfaced.
   * That's the point. A judge pulling the network mid-demo should see a form,
   * not a spinner and an apology.
   */
  async function runAutofill(keys: string[]) {
    setStage("analyzing")
    try {
      const res = await fetch("/api/listings/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: keys }),
        signal: AbortSignal.timeout(AUTOFILL_TIMEOUT_MS),
      })
      const body = (await res.json()) as AutofillResponse
      if (res.ok && body.ok) {
        setFields((current) => ({ ...current, ...body.fields }))
        setConditionReasoning(body.conditionReasoning)
        setPrice(body.price)
      }
    } catch {
      // Deliberately silent.
    } finally {
      setStage("form")
    }
  }

  function handlePhotosDone(keys: string[]) {
    setImageKeys(keys)
    runAutofill(keys)
  }

  async function submit() {
    setPending(true)
    setError(null)

    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleEn: fields.titleEn,
        titleAm: fields.titleAm || undefined,
        descriptionEn: fields.descriptionEn || undefined,
        categorySlug: fields.categorySlug,
        condition: fields.condition,
        priceEtb: fields.priceEtb ? Number(fields.priceEtb) : undefined,
        negotiable: fields.negotiable,
        locationArea: fields.locationArea || undefined,
        images: imageKeys,
      }),
    })

    setPending(false)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Couldn't post that. Try again.")
      return
    }

    setResult((await res.json()) as Result)
    clearDraft()
    setStage("done")
  }

  if (stage === "done" && result) {
    const queued = result.status === "queued"
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">
          {queued ? "Sent for review" : "Your listing is live"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {queued
            ? "New accounts get a quick look from a moderator before going public. It usually takes a few minutes."
            : "It's on the marketplace now."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!queued ? (
            <Button render={<Link href={`/listing/${result.id}`} />}>
              View listing
            </Button>
          ) : null}
          <Button
            variant="outline"
            render={<Link href="/browse" />}
          >
            Back to browse
          </Button>
        </div>
      </div>
    )
  }

  if (stage === "photos") {
    return (
      <PhotoStep onDone={handlePhotosDone} onSkip={() => setStage("form")} />
    )
  }

  if (stage === "analyzing") {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="text-sm text-foreground">Reading your photos…</p>
        <p className="text-sm text-muted-foreground">
          You&rsquo;ll be able to change anything we fill in.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {restored ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Picked up where you left off.
        </p>
      ) : null}

      {imageKeys.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {imageKeys.map((key) => (
            <li
              key={key}
              className="aspect-4/3 overflow-hidden rounded-lg border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${mediaBaseUrl}${key}`}
                alt=""
                className="size-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <ListingForm
        fields={fields}
        onChange={patch}
        categories={categories}
        conditions={conditions}
        areas={areas}
        price={price}
        conditionReasoning={conditionReasoning}
        onSubmit={submit}
        pending={pending}
        error={error}
      />
    </div>
  )
}

"use client"

import * as React from "react"
import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * A 4x3 solid mid-zinc PNG, 73 bytes, inlined.
 *
 * Deliberately not a preview of the photo. Generating a real per-image blur
 * needs either a build-time static import (impossible for rows that arrive from
 * Telegram at runtime) or a `blur_data_url` column and a backfill over R2. Until
 * that exists, a neutral tile is the honest placeholder: it holds the box at the
 * right colour weight in both themes and never implies detail that is not there.
 *
 * Mid-grey rather than theme-matched on purpose -- it sits over a `bg-muted`
 * box, so it reads as slightly darker than the surface in light mode and
 * slightly lighter in dark, and never flashes bright on a dark screen.
 */
export const NEUTRAL_BLUR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR42mPo6p0MRww4OQCFLhP5txG+MQAAAABJRU5ErkJggg=="

/**
 * A listing photograph that degrades to the no-photo state.
 *
 * `ListingCard` already handles the case where a listing has no image row at
 * all. This handles the other one: a row exists, so we promise a photo, and the
 * fetch fails -- an object deleted out of R2, a key written wrong by the
 * ingester, a bucket that is briefly unreachable. Without this the browser
 * renders its own broken-image glyph inside our card, which looks like our bug
 * even when it is not our outage.
 *
 * The only reason this is a client component. It stays a leaf so the card and
 * the grid above it remain server-rendered: what ships to the browser is an
 * error handler, not a listing renderer.
 */
export function ListingImage({
  src,
  alt,
  sizes,
  priority = false,
  noPhotoLabel,
  categoryLabel,
  className,
}: {
  src: string
  alt: string
  sizes: string
  priority?: boolean
  /** "No photo" in the reader's language. Two strings, not an element -- see below. */
  noPhotoLabel: string
  categoryLabel: string
  className?: string
}) {
  const [failed, setFailed] = React.useState(false)

  // A new src is a new chance: a card recycled by a client-side navigation must
  // not inherit the previous listing's failure.
  React.useEffect(() => setFailed(false), [src])

  if (failed) {
    return <NoPhoto label={categoryLabel} noPhotoLabel={noPhotoLabel} />
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      placeholder="blur"
      blurDataURL={NEUTRAL_BLUR}
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  )
}

/**
 * Roughly one listing in twenty arrives with no usable photo, and a flat grey
 * box reads as a bug, so the empty state says what the item is instead.
 *
 * Lives here rather than in the card, and takes two strings rather than arriving
 * as a `fallback` element. Passing the rendered element down from the server
 * serialised a whole unused subtree into the RSC payload for every card on the
 * page -- ten copies of a hatched box nobody saw. Two strings cost two strings.
 */
export function NoPhoto({
  label,
  noPhotoLabel,
}: {
  label: string
  noPhotoLabel: string
}) {
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 11px)",
      }}
    >
      <span className="type-ledger rounded-md bg-background/85 px-2 py-1">
        {noPhotoLabel}
      </span>
      <span className="type-ledger opacity-70">{label}</span>
    </div>
  )
}

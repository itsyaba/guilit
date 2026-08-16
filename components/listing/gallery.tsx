"use client"

import * as React from "react"
import Image from "next/image"

import type { ListingImage } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Photo gallery.
 *
 * The frame is a fixed 4:3 box, so switching photos never resizes the page and
 * the first paint reserves the right space. Thumbnails are buttons in a
 * tablist, which gives arrow-key movement for free.
 */
export function Gallery({
  images,
  title,
  categoryLabel,
}: {
  images: ListingImage[]
  title: string
  categoryLabel: string
}) {
  const [index, setIndex] = React.useState(0)
  const active = images[index]

  if (!active) {
    return (
      <div
        className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted text-muted-foreground"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 11px)",
        }}
      >
        <span className="type-ledger rounded-md bg-background/85 px-2 py-1">
          No photo in the original post
        </span>
        <span className="type-ledger opacity-70">{categoryLabel}</span>
      </div>
    )
  }

  return (
    <div>
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          key={active.url}
          src={active.url}
          alt={active.alt || title}
          fill
          priority
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 ? (
        <div
          role="tablist"
          aria-label={`Photos of ${title}`}
          className="no-scrollbar mt-3 flex gap-2 overflow-x-auto"
        >
          {images.map((image, position) => (
            <button
              key={image.url}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-label={`Photo ${position + 1} of ${images.length}`}
              onClick={() => setIndex(position)}
              className={cn(
                "relative aspect-4/3 w-20 shrink-0 overflow-hidden rounded-md border transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                position === index
                  ? "border-foreground"
                  : "border-border opacity-70 hover:opacity-100"
              )}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

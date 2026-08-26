"use client"

import * as React from "react"
import Image from "next/image"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import type { ListingImage } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Photo gallery.
 *
 * The frame is a fixed 4:3 box inside a tray, so switching photos never resizes
 * the page and the first paint reserves the right space. Thumbnails are buttons
 * in a tablist, which gives arrow-key movement for free; the two chevrons over
 * the image are the same moves for a mouse, and they sit outside the tablist so
 * they don't get swept into its arrow-key order.
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

  /**
   * The empty state is the same enclosure as a real gallery, not a smaller box:
   * a listing with no photo is the common case for scraped stock, and a page
   * that visibly collapses around the missing photo reads as broken rather than
   * as honest.
   */
  if (!active) {
    return (
      <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div
          className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-panel bg-card text-muted-foreground ring-1 ring-hairline"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 11px)",
          }}
        >
          <span className="type-ledger rounded-full bg-background/85 px-3 py-1.5 backdrop-blur">
            No photo in the original post
          </span>
          <span className="type-ledger opacity-70">{categoryLabel}</span>
        </div>
      </div>
    )
  }

  const many = images.length > 1
  const step = (delta: number) =>
    setIndex((current) => (current + delta + images.length) % images.length)

  return (
    <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
      <div className="group/frame relative aspect-4/3 w-full overflow-hidden rounded-panel bg-card ring-1 ring-hairline">
        <Image
          key={active.url}
          src={active.url}
          alt={active.alt || title}
          fill
          priority
          sizes="(min-width: 1024px) 56vw, 100vw"
          className="object-cover"
        />

        {many ? (
          <>
            <Step onClick={() => step(-1)} side="left" />
            <Step onClick={() => step(1)} side="right" />

            <span className="type-ledger absolute right-3 bottom-3 rounded-full bg-background/85 px-3 py-1.5 text-foreground backdrop-blur">
              {index + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>

      {many ? (
        <div
          role="tablist"
          aria-label={`Photos of ${title}`}
          className="mt-2 no-scrollbar flex gap-2 overflow-x-auto px-1 pb-1"
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
                "relative aspect-4/3 w-20 shrink-0 overflow-hidden rounded-tile bg-card",
                "transition-[box-shadow,opacity,transform] duration-500 ease-fluid",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                position === index
                  ? "ring-2 ring-primary"
                  : "opacity-65 ring-1 ring-hairline hover:opacity-100 hover:ring-hairline"
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

/**
 * One chevron. Always present rather than hover-only: on a touch screen there
 * is no hover, and a control that only exists for mouse users is a control half
 * the market cannot find.
 */
function Step({
  onClick,
  side,
}: {
  onClick: () => void
  side: "left" | "right"
}) {
  const Icon = side === "left" ? IconChevronLeft : IconChevronRight

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-background/85 text-foreground shadow-ambient backdrop-blur",
        "transition-[transform,background-color] duration-500 ease-fluid",
        "hover:bg-background active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        side === "left" ? "left-3" : "right-3"
      )}
    >
      <Icon aria-hidden="true" stroke={1.5} className="size-5" />
    </button>
  )
}

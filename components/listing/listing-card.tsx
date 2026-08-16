import Image from "next/image"
import Link from "next/link"

import { Price } from "@/components/listing/price"
import { ProvenanceStrip } from "@/components/listing/provenance-strip"
import { TierTag } from "@/components/listing/tier-tag"
import { CONDITION_LABELS } from "@/lib/format"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * One row of the index.
 *
 * The card is priced first, because price is the axis people scan a used-goods
 * market on. The title below it is the seller's own words -- Amharic when they
 * wrote in Amharic -- with the English name underneath as a second line.
 *
 * Every slot has a fixed height so a grid of 24 cards lays out identically
 * whether the data has a photo, a price, or neither.
 */
export function ListingCard({
  listing,
  priority = false,
}: {
  listing: Listing
  /** Set on the first row only; everything below the fold lazy-loads. */
  priority?: boolean
}) {
  const image = listing.images[0]
  const title = listing.title

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        "transition-colors hover:border-foreground/25",
        "focus-within:border-foreground/25 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority={priority}
            sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 45vw, 92vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <NoPhoto label={listing.categoryLabel} />
        )}

        <TierTag tier={listing.tier} className="absolute top-2 left-2" />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Price value={listing.priceEtb} />

        <h3 className="line-clamp-2 min-h-[2.5lh] text-sm font-medium text-foreground">
          <Link
            href={`/listing/${listing.id}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>

        <p className="type-ledger mt-auto truncate text-xs text-muted-foreground">
          {CONDITION_LABELS[listing.condition]} · {listing.location.area}
        </p>

        <ProvenanceStrip
          listing={listing}
          className="mt-auto border-t border-border pt-2.5"
        />
      </div>
    </article>
  )
}

/**
 * Roughly one listing in twenty arrives with no usable photo. A flat grey box
 * reads as a bug, so the empty state says what the item is instead.
 */
function NoPhoto({ label }: { label: string }) {
  return (
    <div
      className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground"
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 11px)",
      }}
    >
      <span className="type-ledger rounded-md bg-background/85 px-2 py-1">
        No photo
      </span>
      <span className="type-ledger opacity-70">{label}</span>
    </div>
  )
}

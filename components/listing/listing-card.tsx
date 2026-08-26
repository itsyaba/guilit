import Link from "next/link"

import { ListingImage, NoPhoto } from "@/components/listing/listing-image"
import { Price } from "@/components/listing/price"
import { ProvenanceStrip } from "@/components/listing/provenance-strip"
import { TierTag } from "@/components/listing/tier-tag"
import { conditionLabel } from "@/lib/format"
import { getLang, strings } from "@/lib/i18n"
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
/**
 * The browse grid: one column on a phone, up to four at 1536px.
 *
 * A default rather than a constant, because the same card sits in a 5-across
 * rail on the front page where these numbers would ask the optimiser for an
 * image three times wider than the slot it lands in.
 */
const BROWSE_SIZES =
  "(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 45vw, 92vw"

export async function ListingCard({
  listing,
  priority = false,
  sizes = BROWSE_SIZES,
}: {
  listing: Listing
  /** Set on the first row only; everything below the fold lazy-loads. */
  priority?: boolean
  /** The slot's real width at each breakpoint. Wrong here means wasted bytes. */
  sizes?: string
}) {
  // Chrome switches language; the title does not. It is the seller's own words
  // about their own item, so an Amharic title stays Amharic on an English page.
  const lang = await getLang()
  const s = strings(lang)
  const image = listing.images[0]
  const title = listing.title

  return (
    <article
      className={cn(
        // The tile is the third step of the enclosure scale: a `rounded-shell`
        // tray holds a `rounded-panel` core holds these. Hover lifts the card
        // off the page instead of darkening its edge -- a border that changes
        // colour is the one hover state that reads as a link on a page of
        // links, and there are twenty-four of them here.
        "group relative flex flex-col overflow-hidden rounded-tile bg-card ring-1 ring-hairline",
        "transition-[transform,box-shadow] duration-500 ease-fluid",
        "hover:-translate-y-0.5 hover:shadow-ambient",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
      )}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        {image ? (
          <ListingImage
            src={image.url}
            alt={image.alt}
            priority={priority}
            sizes={sizes}
            noPhotoLabel={s.noPhoto}
            categoryLabel={listing.categoryLabel}
            className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <NoPhoto label={listing.categoryLabel} noPhotoLabel={s.noPhoto} />
        )}

        <TierTag tier={listing.tier} className="absolute top-2 left-2" />
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Price value={listing.priceEtb} />

        <h3
          lang="am"
          className="line-clamp-2 min-h-[2.5lh] text-sm font-medium text-foreground"
        >
          <Link
            href={`/listing/${listing.id}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>

        <p className="type-ledger mt-auto truncate text-xs text-muted-foreground">
          {listing.condition
            ? `${conditionLabel(listing.condition, lang)} · `
            : ""}
          {listing.location.area}
        </p>

        <ProvenanceStrip
          listing={listing}
          className="mt-auto border-t border-hairline pt-2.5"
        />
      </div>
    </article>
  )
}

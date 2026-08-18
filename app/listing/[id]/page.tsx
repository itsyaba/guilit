import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"

import { ChannelLedger } from "@/components/listing/channel-ledger"
import { ContactPanel } from "@/components/listing/contact-panel"
import { Gallery } from "@/components/listing/gallery"
import { ListingCard } from "@/components/listing/listing-card"
import { Price } from "@/components/listing/price"
import { PriceCheck } from "@/components/listing/price-check"
import { SafetyNote } from "@/components/listing/safety-note"
import { SellerBlock } from "@/components/listing/seller-block"
import { TierTag } from "@/components/listing/tier-tag"
import { CONDITION_LABELS, formatShortDate } from "@/lib/format"
import { getListing, getListingIds, getRelatedListings } from "@/lib/listings"
import { getSessionUser } from "@/lib/session"
import type { Listing } from "@/lib/types"

export async function generateStaticParams() {
  const ids = await getListingIds()
  return ids.map((id) => ({ id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: "Listing not found" }

  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
  }
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  const [related, sessionUser] = await Promise.all([
    getRelatedListings(listing),
    getSessionUser(),
  ])

  return (
    <article className="mx-auto max-w-[80rem] px-4 py-5 sm:px-6 lg:py-8">
      <Link
        href={`/browse?category=${listing.categorySlug}`}
        className="type-ledger inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <IconArrowLeft aria-hidden="true" className="size-3.5" />
        {listing.categoryLabel}
      </Link>

      <div className="mt-4 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Left on desktop, first on mobile. */}
        <Gallery
          images={listing.images}
          title={listing.title}
          categoryLabel={listing.categoryLabel}
        />

        {/* Everything needed to decide, kept together and kept in view. */}
        <div className="space-y-5 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2">
          <ListingHeading listing={listing} />
          <ContactPanel listing={listing} isLoggedIn={sessionUser !== null} />
          <PriceCheck listing={listing} />
          <SellerBlock listing={listing} />
        </div>

        <div className="space-y-8 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="type-ledger text-foreground">
              Description
            </h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground">
              {listing.description}
            </p>
          </section>

          <SafetyNote />

          <ChannelLedger listing={listing} />
        </div>
      </div>

      {related.length > 0 ? (
        <section
          aria-labelledby="related-heading"
          className="mt-16 border-t border-border pt-10"
        >
          <h2
            id="related-heading"
            className="type-display text-lg font-semibold text-foreground"
          >
            More {listing.categoryLabel.toLowerCase()} in Addis
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <ListingCard listing={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

function ListingHeading({ listing }: { listing: Listing }) {
  return (
    <header>
      <div className="flex items-center gap-2">
        <TierTag tier={listing.tier} />
        <span className="type-ledger text-muted-foreground">
          posted {formatShortDate(listing.postedAt)}
        </span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold text-foreground">
        {listing.title}
      </h1>

      <div className="mt-4">
        <Price value={listing.priceEtb} size="detail" />
        <p className="type-ledger mt-1 text-muted-foreground">
          {CONDITION_LABELS[listing.condition]} · {listing.location.area},{" "}
          {listing.location.city}
          {listing.negotiable && listing.priceEtb !== null
            ? " · negotiable"
            : ""}
        </p>
      </div>
    </header>
  )
}

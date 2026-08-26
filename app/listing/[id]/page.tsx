import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"

import { Eyebrow, Shell, TextLink } from "@/components/kit"
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
import { cn } from "@/lib/utils"

/**
 * Listing pages are prerendered, but a listing can be withdrawn — a removal
 * request sets status='removed' and the page must stop serving. Without this
 * the built HTML would keep answering indefinitely, which is a compliance
 * problem under Proclamation 1321/2024, not just a staleness one.
 */
export const revalidate = 900

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
    // A listing still in the moderation queue is shareable by link but must not
    // be indexed — search engines would outlive the review.
    robots:
      listing.status === "live" ? undefined : { index: false, follow: false },
  }
}

/**
 * One item.
 *
 * The split is not decorative: the photo and the decision rail are the two
 * things a buyer needs simultaneously, so the rail sticks and everything that
 * is read once — description, meetup rules, the source table — sits underneath
 * the gallery where it can be as long as it needs to be.
 *
 * The rail's order is the order the question gets answered in: what it is and
 * what it costs, how to reach the seller, whether the price is fair, who the
 * seller is. Contact sits second rather than last because on a phone that is
 * the only thing above the fold after the photo.
 */
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
    <article className="mx-auto max-w-[80rem] px-4 pt-5 pb-20 sm:px-6 lg:pt-8 lg:pb-28">
      <Link
        href={`/browse?category=${listing.categorySlug}`}
        className={cn(
          "group/back type-ledger type-mixed inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5",
          "text-muted-foreground shadow-hairline ring-1 ring-hairline",
          "transition-[color,box-shadow] duration-500 ease-fluid",
          "hover:text-foreground hover:shadow-ambient",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
        )}
      >
        <IconArrowLeft
          aria-hidden="true"
          stroke={1.5}
          className="size-3.5 transition-transform duration-500 ease-fluid group-hover/back:-translate-x-0.5"
        />
        {listing.categoryLabel}
      </Link>

      <div className="anim-rise mt-5 flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Left on desktop, first on mobile. */}
        <Gallery
          images={listing.images}
          title={listing.title}
          categoryLabel={listing.categoryLabel}
        />

        {/* Everything needed to decide, kept together and kept in view. */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2">
          <ListingHeading listing={listing} />
          <ContactPanel listing={listing} isLoggedIn={sessionUser !== null} />
          <PriceCheck listingId={listing.id} priceEtb={listing.priceEtb} />
          <SellerBlock listing={listing} />
        </div>

        <div className="space-y-10 lg:col-start-1 lg:row-start-2">
          <section aria-labelledby="description-heading">
            <h2 id="description-heading">
              <Eyebrow>Description</Eyebrow>
            </h2>
            {/*
             * The seller's own words, marked `lang="am"` because most of them
             * are Amharic and the per-script leading in globals.css is driven
             * off the language, not off a class someone remembers to add.
             */}
            <p
              lang="am"
              className="mt-4 max-w-prose text-base leading-relaxed whitespace-pre-line text-foreground"
            >
              {listing.description}
            </p>
          </section>

          <ChannelLedger listing={listing} />

          <SafetyNote />
        </div>
      </div>

      {related.length > 0 ? (
        <section
          aria-labelledby="related-heading"
          className="anim-reveal mt-20"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow>More like this</Eyebrow>
              <h2
                id="related-heading"
                className="type-display mt-4 text-xl font-semibold text-foreground sm:text-2xl"
              >
                More {listing.categoryLabel.toLowerCase()} in Addis
              </h2>
            </div>
            <TextLink href={`/browse?category=${listing.categorySlug}`}>
              See all {listing.categoryLabel.toLowerCase()}
            </TextLink>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id} className="min-w-0">
                <ListingCard listing={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  )
}

/**
 * The heading block: state, title, price, and the one line of facts underneath.
 *
 * The price is the largest type on the page — larger than the title — because
 * that is the order a used-goods shopper reads in, and the title is right there
 * above it doing the naming.
 */
function ListingHeading({ listing }: { listing: Listing }) {
  const facts = [
    listing.condition ? CONDITION_LABELS[listing.condition] : null,
    `${listing.location.area}, ${listing.location.city}`,
    listing.negotiable && listing.priceEtb !== null ? "negotiable" : null,
  ].filter((fact): fact is string => !!fact)

  return (
    <Shell coreClassName="p-5 sm:p-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <TierTag tier={listing.tier} />
          <span className="type-ledger text-muted-foreground">
            posted {formatShortDate(listing.postedAt)}
          </span>
        </div>

        <h1
          lang="am"
          className="type-display mt-4 text-xl leading-snug font-semibold text-foreground sm:text-2xl"
        >
          {listing.title}
        </h1>

        <div className="mt-5 border-t border-hairline pt-5">
          <Price value={listing.priceEtb} size="detail" />

          {/* Hairline-separated inline list rather than " · " glue, so an
              Amharic area name never ends up sharing a middot with a wrapped
              English condition. */}
          <ul className="type-ledger type-mixed mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            {facts.map((fact) => (
              <li
                key={fact}
                className="after:ml-2 after:text-muted-foreground/50 after:content-['·'] last:after:content-none"
              >
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </header>
    </Shell>
  )
}

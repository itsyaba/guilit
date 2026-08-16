import { IconShieldCheck, IconStarFilled } from "@tabler/icons-react"

import { formatLongDate } from "@/lib/format"
import type { Listing } from "@/lib/types"

/**
 * Who you would be buying from.
 *
 * For an indexed listing the honest answer is "we don't know" -- there is a
 * channel and a phone number in a post, and nothing else. Saying so plainly is
 * worth more than a badge that overstates what we checked.
 */
export function SellerBlock({ listing }: { listing: Listing }) {
  const { seller, tier } = listing
  const channel = listing.sources[0]

  if (tier === "indexed") {
    return (
      <section
        aria-labelledby="seller-heading"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2 id="seller-heading" className="type-ledger text-foreground">
          Seller
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Nobody has claimed this listing yet. It was posted in{" "}
          <span className="type-mixed text-foreground">
            {channel?.channelTitle ?? "a Telegram channel"}
          </span>{" "}
          and Gulit has not verified who wrote it or whether the item is still
          available.
        </p>
        {seller.phoneMasked ? (
          <p className="type-ledger mt-3 text-muted-foreground">
            phone in the post · {seller.phoneMasked}
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section
      aria-labelledby="seller-heading"
      className="rounded-lg border border-border bg-card p-4"
    >
      <h2 id="seller-heading" className="type-ledger text-foreground">
        Seller
      </h2>

      <div className="mt-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
        >
          {(seller.displayName ?? "?").slice(0, 1)}
        </span>

        <div className="min-w-0">
          <p className="type-mixed truncate text-sm font-medium text-foreground">
            {seller.displayName ?? "Gulit seller"}
          </p>

          {seller.ratingAvg !== null && seller.ratingCount !== null ? (
            <p className="type-ledger mt-1 flex items-center gap-1 text-muted-foreground">
              <IconStarFilled aria-hidden="true" className="size-3" />
              {seller.ratingAvg.toFixed(1)} from {seller.ratingCount} buyers
            </p>
          ) : null}

          {seller.memberSince ? (
            <p className="type-ledger mt-1 text-muted-foreground">
              on gulit since {formatLongDate(seller.memberSince)}
            </p>
          ) : null}
        </div>
      </div>

      {seller.phoneVerified ? (
        <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          <IconShieldCheck
            aria-hidden="true"
            className="mt-px size-4 shrink-0 text-primary"
          />
          <span>
            Phone number verified by SMS. That confirms the number, nothing else
            about the seller or the item.
          </span>
        </p>
      ) : null}
    </section>
  )
}

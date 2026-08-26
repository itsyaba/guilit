import { IconShieldCheck, IconStarFilled } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
import { formatLongDate } from "@/lib/format"
import type { Listing } from "@/lib/types"

/**
 * Who you would be buying from.
 *
 * For an indexed listing the honest answer is "we don't know" -- there is a
 * channel and a phone number in a post, and nothing else. Saying so plainly is
 * worth more than a badge that overstates what we checked, and it is why this
 * panel is quiet in the tray rather than dressed up as a profile card.
 */
export function SellerBlock({ listing }: { listing: Listing }) {
  const { seller, tier } = listing
  const channel = listing.sources[0]

  if (tier === "indexed") {
    return (
      <Shell coreClassName="p-5">
        <section aria-labelledby="seller-heading">
          <h2 id="seller-heading">
            <Eyebrow tone="quiet">Seller</Eyebrow>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Nobody has claimed this listing yet. It was posted in{" "}
            <span className="type-mixed font-medium text-foreground">
              {channel?.channelTitle ?? "a Telegram channel"}
            </span>{" "}
            and Gulit has not verified who wrote it or whether the item is still
            available.
          </p>
          {seller.phoneMasked ? (
            <p className="type-ledger mt-4 border-t border-hairline pt-4 text-muted-foreground">
              phone in the post · {seller.phoneMasked}
            </p>
          ) : null}
        </section>
      </Shell>
    )
  }

  return (
    <Shell coreClassName="p-5">
      <section aria-labelledby="seller-heading">
        <h2 id="seller-heading">
          <Eyebrow tone="quiet">Seller</Eyebrow>
        </h2>

        <div className="mt-4 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tray text-sm font-semibold text-muted-foreground ring-1 ring-hairline"
          >
            {(seller.displayName ?? "?").slice(0, 1)}
          </span>

          <div className="min-w-0">
            <p className="type-mixed truncate text-sm font-medium text-foreground">
              {seller.displayName ?? "Gulit seller"}
            </p>

            {seller.ratingAvg !== null && seller.ratingCount !== null ? (
              <p className="type-ledger mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                <IconStarFilled
                  aria-hidden="true"
                  className="size-3 text-primary"
                />
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
          <p className="mt-4 flex items-start gap-2.5 border-t border-hairline pt-4 text-xs leading-relaxed text-muted-foreground">
            <IconShieldCheck
              aria-hidden="true"
              stroke={1.5}
              className="mt-px size-4 shrink-0 text-primary"
            />
            <span>
              Phone number verified by SMS. That confirms the number, nothing
              else about the seller or the item.
            </span>
          </p>
        ) : null}
      </section>
    </Shell>
  )
}

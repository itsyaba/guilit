import { IconBrandTelegram, IconChevronRight, IconPhone } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { ClaimPanel } from "@/components/listing/claim-panel"
import { MessageSellerStub } from "@/components/listing/message-seller-stub"
import { RemoveListingButton } from "@/components/listing/remove-listing-button"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Contact routes to wherever the seller already is.
 *
 * For an indexed listing that means the original Telegram post, not a form on
 * our domain. That is a deliberate product choice as much as a legal one: the
 * seller never agreed to talk to us, and a buyer who lands in the channel can
 * see the whole post for themselves. A tel: link sits alongside it once a
 * phone number is on file — it's already public in the post we link to, this
 * just saves a tap.
 */
export function ContactPanel({
  listing,
  isLoggedIn = false,
  className,
}: {
  listing: Listing
  isLoggedIn?: boolean
  className?: string
}) {
  const source = listing.sources[0]
  const handle = listing.seller.telegramHandle

  /**
   * Pending review. A new account's post is live enough to link to, but nobody
   * can reach the seller through it until a moderator has looked — that's the
   * whole point of trust routing. Say so plainly instead of rendering a dead
   * button, and note that nothing needs doing.
   */
  if (listing.status === "queued") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-muted/50 px-3.5 py-3 text-sm leading-relaxed",
          className
        )}
      >
        <p className="font-medium text-foreground">Waiting on a quick review</p>
        <p className="mt-1 text-muted-foreground">
          Contact details stay hidden until a moderator clears this listing. New
          accounts go through this once; it usually takes a few minutes.
        </p>
      </div>
    )
  }

  if (listing.tier === "native") {
    return (
      <div className={cn("space-y-3", className)}>
        <MessageSellerStub />
      </div>
    )
  }

  const telegramHref = source
    ? source.messageUrl
    : handle
      ? `https://t.me/${handle}`
      : null

  const telegramLabel = listing.tier === "claimed" ? "Message on Telegram" : "Open the original post"

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        size="lg"
        className="h-12 w-full rounded-lg text-base"
        render={
          telegramHref ? (
            <a href={telegramHref} target="_blank" rel="noopener noreferrer nofollow" />
          ) : (
            <span />
          )
        }
        disabled={!telegramHref}
      >
        <IconBrandTelegram aria-hidden="true" className="size-5" />
        {telegramLabel}
      </Button>

      {listing.seller.phone ? (
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-lg text-base"
          render={<a href={`tel:${listing.seller.phone}`} />}
        >
          <IconPhone aria-hidden="true" className="size-5" />
          Call {listing.seller.phoneMasked}
        </Button>
      ) : null}

      {listing.tier === "indexed" ? (
        <details className="group rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <IconChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
            />
            Is this listing yours?
          </summary>
          <div className="space-y-3 border-t border-border px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              You can take it over by verifying the phone number already in the
              post — no paperwork, one SMS code. Once it is yours you can edit
              the price, mark it sold, or have it removed entirely.
            </p>
            <ClaimPanel listingId={listing.id} isLoggedIn={isLoggedIn} />
            <div className="space-y-1 border-t border-border pt-3">
              <RemoveListingButton listingId={listing.id} />
              {source ? (
                <p>
                  <a
                    href={source.messageUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary underline underline-offset-4"
                  >
                    Open the post this came from
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  )
}

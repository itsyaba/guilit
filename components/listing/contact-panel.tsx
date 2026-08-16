import { IconBrandTelegram, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { Listing } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Contact routes to wherever the seller already is.
 *
 * For an indexed listing that means the original Telegram post, not a form on
 * our domain. That is a deliberate product choice as much as a legal one: the
 * seller never agreed to talk to us, and a buyer who lands in the channel can
 * see the whole post for themselves.
 */
export function ContactPanel({
  listing,
  className,
}: {
  listing: Listing
  className?: string
}) {
  const source = listing.sources[0]
  const handle = listing.seller.telegramHandle

  const href = source
    ? source.messageUrl
    : handle
      ? `https://t.me/${handle}`
      : null

  const label =
    listing.tier === "native"
      ? "Message the seller"
      : listing.tier === "claimed"
        ? "Message on Telegram"
        : "Open the original post"

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        size="lg"
        className="h-12 w-full rounded-lg text-base"
        render={
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" />
          ) : (
            <span />
          )
        }
        disabled={!href}
      >
        <IconBrandTelegram aria-hidden="true" className="size-5" />
        {label}
      </Button>

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
            <p>
              Removal is one tap and we do not ask for a reason.{" "}
              {source ? (
                <a
                  href={source.messageUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-primary underline underline-offset-4"
                >
                  Open the post this came from
                </a>
              ) : null}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  )
}

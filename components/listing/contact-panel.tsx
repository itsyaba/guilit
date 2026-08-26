import Link from "next/link"
import {
  IconBrandTelegram,
  IconChevronRight,
  IconPhone,
} from "@tabler/icons-react"

import { ClaimPanel } from "@/components/listing/claim-panel"
import { MessageSeller } from "@/components/listing/message-seller"
import { RemoveListingButton } from "@/components/listing/remove-listing-button"
import type { ListingMessagingContext } from "@/lib/messaging"
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
 *
 * In-app messaging is the exception, and only where Telegram cannot serve: a
 * listing posted here has no channel post to open, so the thread is the primary
 * route. A claimed listing gets it as a second option under Telegram — that
 * seller is provably reachable where they already are, and a buyer who prefers
 * to keep the conversation on our side can.
 *
 * Both buttons are full-width pills with the icon in its own recessed circle.
 * They are the two things this page exists to get tapped, so they are the only
 * controls on it at that weight.
 */
export function ContactPanel({
  listing,
  isLoggedIn = false,
  messaging,
  className,
}: {
  listing: Listing
  isLoggedIn?: boolean
  /** Resolved per viewer — see lib/messaging.getListingMessagingContext. */
  messaging?: ListingMessagingContext
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
          "rounded-shell bg-tray p-2 ring-1 ring-hairline",
          className
        )}
      >
        <div className="rounded-panel bg-card p-5 text-sm leading-relaxed ring-1 ring-hairline">
          <p className="font-medium text-foreground">
            Waiting on a quick review
          </p>
          <p className="mt-2 text-muted-foreground">
            Contact details stay hidden until a moderator clears this listing.
            New accounts go through this once; it usually takes a few minutes.
          </p>
        </div>
      </div>
    )
  }

  const canMessage = messaging?.canMessage ?? false
  const conversationId = messaging?.conversationId ?? null

  /**
   * A native listing has nothing else. If messaging is unavailable here it is
   * because the viewer is the seller, and a seller looking at their own post
   * needs the thread list, not a contact button.
   */
  if (listing.tier === "native") {
    if (messaging?.isOwnListing) {
      return (
        <div
          className={cn(
            "rounded-shell bg-tray p-2 ring-1 ring-hairline",
            className
          )}
        >
          <div className="rounded-panel bg-card p-5 text-sm leading-relaxed ring-1 ring-hairline">
            <p className="font-medium text-foreground">This is your listing</p>
            <p className="mt-2 text-muted-foreground">
              Buyers who message you appear in{" "}
              <Link
                href="/messages"
                className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
              >
                Messages
              </Link>
              .
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className={cn("space-y-3", className)}>
        <MessageSeller
          listingId={listing.id}
          isLoggedIn={isLoggedIn}
          conversationId={conversationId}
          tone="solid"
        />
      </div>
    )
  }

  const telegramHref = source
    ? source.messageUrl
    : handle
      ? `https://t.me/${handle}`
      : null

  const telegramLabel =
    listing.tier === "claimed"
      ? "Message on Telegram"
      : "Open the original post"

  return (
    <div className={cn("space-y-3", className)}>
      <ContactAction
        href={telegramHref}
        tone="solid"
        icon={
          <IconBrandTelegram
            aria-hidden="true"
            stroke={1.5}
            className="size-5"
          />
        }
        external
      >
        {telegramLabel}
      </ContactAction>

      {listing.seller.phone ? (
        <ContactAction
          href={`tel:${listing.seller.phone}`}
          tone="quiet"
          icon={
            <IconPhone aria-hidden="true" stroke={1.5} className="size-5" />
          }
        >
          Call {listing.seller.phoneMasked}
        </ContactAction>
      ) : null}

      {/* Claimed sellers keep Telegram as the headline route; this is the
          alternative for a buyer who would rather not hand over a handle. */}
      {canMessage ? (
        <MessageSeller
          listingId={listing.id}
          isLoggedIn={isLoggedIn}
          conversationId={conversationId}
          tone="quiet"
        />
      ) : null}

      {listing.tier === "indexed" ? (
        /* The claim flow is the page's one piece of small print, so it opens
           closed: a buyer never needs it, and the one seller who does is
           looking for exactly this sentence. */
        <details className="group rounded-shell bg-tray p-2 ring-1 ring-hairline">
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center gap-2 rounded-panel px-3.5 py-3 text-sm text-foreground",
              "transition-colors duration-500 ease-fluid hover:bg-card/70",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            )}
          >
            <IconChevronRight
              aria-hidden="true"
              stroke={1.5}
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-500 ease-fluid group-open:rotate-90"
            />
            Is this listing yours?
          </summary>

          <div className="mt-2 space-y-4 rounded-panel bg-card p-5 text-sm leading-relaxed text-muted-foreground ring-1 ring-hairline">
            <p>
              You can take it over by verifying the phone number already in the
              post — no paperwork, one SMS code. Once it is yours you can edit
              the price, mark it sold, or have it removed entirely.
            </p>
            <ClaimPanel listingId={listing.id} isLoggedIn={isLoggedIn} />
            <div className="space-y-2 border-t border-hairline pt-4">
              <RemoveListingButton listingId={listing.id} />
              {source ? (
                <p>
                  <a
                    href={source.messageUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary underline decoration-primary/30 underline-offset-4 transition-colors duration-500 ease-fluid hover:decoration-primary"
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

/**
 * One contact route. A styled anchor rather than our Button: these are links to
 * somewhere else — Telegram, the dialler — and the disabled case is a listing
 * with no reachable source at all, which is a `span` on purpose so nothing
 * focusable promises a destination it does not have.
 */
function ContactAction({
  href,
  icon,
  tone,
  external = false,
  children,
}: {
  href: string | null
  icon: React.ReactNode
  tone: "solid" | "quiet"
  external?: boolean
  children: React.ReactNode
}) {
  const shell = cn(
    "group/act flex h-14 w-full items-center gap-3 rounded-full pr-6 pl-2 text-base font-medium",
    "transition-[transform,box-shadow] duration-500 ease-fluid",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
    tone === "solid"
      ? "bg-primary text-primary-foreground shadow-ambient hover:shadow-lift"
      : "bg-card text-foreground shadow-hairline ring-1 ring-hairline hover:shadow-ambient",
    href ? "active:scale-[0.99]" : "pointer-events-none opacity-50"
  )

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          "transition-transform duration-500 ease-fluid group-hover/act:scale-105",
          tone === "solid" ? "bg-primary-foreground/18" : "bg-tray"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </>
  )

  if (!href) {
    return (
      <span aria-disabled="true" className={shell}>
        {body}
      </span>
    )
  }

  return (
    <a
      href={href}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer nofollow" }
        : {})}
      className={shell}
    >
      {body}
    </a>
  )
}

import Link from "next/link"
import Image from "next/image"
import { IconMessageCircle, IconPhoto } from "@tabler/icons-react"

import { formatAmount, formatShortDate } from "@/lib/format"
import type { ConversationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The inbox.
 *
 * Every row leads with the item's photo, not the other person's name. A
 * marketplace inbox is a list of things, not a list of people — you remember
 * which sofa, not which handle — and the photo is also the only part of the row
 * that survives being read at arm's length on a phone.
 *
 * Server-rendered: there is nothing interactive here beyond the links, and the
 * page it lives on already had to be dynamic to know who is asking.
 */
export function ThreadList({ threads }: { threads: ConversationSummary[] }) {
  if (threads.length === 0) {
    return (
      <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div className="flex flex-col items-center rounded-panel bg-card px-6 py-16 text-center ring-1 ring-hairline">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-tray ring-1 ring-hairline"
          >
            <IconMessageCircle
              stroke={1.5}
              className="size-6 text-muted-foreground"
            />
          </span>
          <h2 className="type-display mt-6 text-lg font-semibold text-foreground">
            No conversations yet
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Messages you send about a listing posted on Gulit show up here, and
            so do messages buyers send you. Items indexed from Telegram channels
            are contacted in the channel itself.
          </p>
          <Link
            href="/browse"
            className="type-ledger mt-6 text-foreground underline decoration-hairline underline-offset-4 transition-colors duration-500 ease-fluid hover:text-primary"
          >
            Browse listings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {threads.map((thread) => (
        <li key={thread.id} className="min-w-0">
          <Link
            href={`/messages/${thread.id}`}
            className={cn(
              "group/row flex min-w-0 items-center gap-4 rounded-shell bg-card p-3 ring-1 ring-hairline",
              "transition-[box-shadow,transform] duration-500 ease-fluid",
              "hover:shadow-ambient active:scale-[0.997]",
              "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            )}
          >
            <Thumb
              url={thread.listing.imageUrl}
              alt={thread.listing.title}
              unread={thread.unread > 0}
            />

            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <p
                  lang="am"
                  className={cn(
                    "min-w-0 truncate text-sm text-foreground",
                    thread.unread > 0 ? "font-semibold" : "font-medium"
                  )}
                >
                  {thread.listing.title}
                </p>
                <span className="type-ledger ml-auto shrink-0 text-muted-foreground">
                  {formatShortDate(thread.lastMessageAt)}
                </span>
              </div>

              <p className="type-ledger type-mixed mt-1 text-muted-foreground">
                {thread.role === "buyer" ? "You asked" : "Buyer"}
                {thread.counterpart ? ` · @${thread.counterpart}` : ""}
                {thread.listing.priceEtb !== null
                  ? ` · ${formatAmount(thread.listing.priceEtb)} ETB`
                  : ""}
              </p>

              {thread.lastMessage ? (
                <p
                  lang="am"
                  className={cn(
                    "mt-1.5 truncate text-sm",
                    thread.unread > 0
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {thread.lastMessage}
                </p>
              ) : null}
            </div>

            {thread.unread > 0 ? (
              <span className="type-ledger shrink-0 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground tabular-nums">
                {thread.unread}
                <span className="sr-only"> unread messages</span>
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Thumb({
  url,
  alt,
  unread,
}: {
  url: string | null
  alt: string
  unread: boolean
}) {
  return (
    <span
      className={cn(
        "relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-panel bg-tray",
        unread ? "ring-2 ring-primary/40" : "ring-1 ring-hairline"
      )}
    >
      {url ? (
        <Image
          src={url}
          alt={alt}
          width={128}
          height={128}
          className="size-full object-cover transition-transform duration-700 ease-fluid group-hover/row:scale-[1.03]"
        />
      ) : (
        <IconPhoto
          aria-hidden="true"
          stroke={1.5}
          className="size-5 text-muted-foreground"
        />
      )}
    </span>
  )
}

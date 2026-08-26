import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { IconArrowLeft, IconPhoto } from "@tabler/icons-react"

import { DealRail } from "@/components/messages/deal-rail"
import { ThreadView } from "@/components/messages/thread-view"
import { isChapaMockMode } from "@/lib/chapa"
import { formatPrice } from "@/lib/format"
import { getConversation, markThreadRead } from "@/lib/messaging"
import { getSessionUser } from "@/lib/session"
import { isUuid } from "@/lib/utils"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
}

/**
 * One thread.
 *
 * The item sits at the top as a link, not as decoration: half of what gets
 * asked in here ("is that the fair price", "which condition did you say") is
 * answered on the listing page, and a thread that makes you go back to the
 * inbox to re-find the item is a thread you answer from memory instead.
 *
 * Marked read on render. There is no delivery receipt to lean on, so the only
 * honest definition of "read" available to us is that the page was served.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** `?hold=paid|failed|unknown` — set by the redirect back from Chapa. */
  searchParams: Promise<{ hold?: string }>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=/messages/${id}`)

  const [thread, query] = await Promise.all([
    getConversation(id, user.id),
    searchParams,
  ])
  // Null covers "no such thread" and "not yours" alike — see lib/messaging.
  if (!thread) notFound()

  await markThreadRead(id, user.id)

  const holdOutcome =
    query.hold === "paid" || query.hold === "failed" || query.hold === "unknown"
      ? query.hold
      : null

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 lg:pt-10 lg:pb-28">
      <Link
        href="/messages"
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
        Messages
      </Link>

      <div className="mt-5 space-y-4">
        <div className="rounded-shell bg-tray p-2 ring-1 ring-hairline">
          <Link
            href={`/listing/${thread.listing.id}`}
            className={cn(
              "group/item flex min-w-0 items-center gap-4 rounded-panel bg-card p-3 ring-1 ring-hairline",
              "transition-shadow duration-500 ease-fluid hover:shadow-ambient",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            )}
          >
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-tile bg-tray ring-1 ring-hairline">
              {thread.listing.imageUrl ? (
                <Image
                  src={thread.listing.imageUrl}
                  alt={thread.listing.title}
                  width={128}
                  height={128}
                  className="size-full object-cover transition-transform duration-700 ease-fluid group-hover/item:scale-[1.03]"
                />
              ) : (
                <IconPhoto
                  aria-hidden="true"
                  stroke={1.5}
                  className="size-5 text-muted-foreground"
                />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <h1
                lang="am"
                className="type-display truncate text-base font-semibold text-foreground"
              >
                {thread.listing.title}
              </h1>
              <p className="type-ledger type-mixed mt-1 text-muted-foreground">
                {thread.role === "buyer" ? "Seller" : "Buyer"}
                {thread.counterpart ? ` · @${thread.counterpart}` : ""}
                {thread.listing.priceEtb !== null
                  ? ` · ${formatPrice(thread.listing.priceEtb)}`
                  : ""}
              </p>
              {thread.listing.status !== "live" ? (
                <p className="type-ledger mt-1 text-muted-foreground">
                  This listing is no longer live.
                </p>
              ) : null}
            </div>
          </Link>
        </div>

        {/* Between the item and the conversation, which is where the decision
            actually sits: you have just looked at what it is, and you are about
            to talk about when to collect it. */}
        <DealRail
          conversationId={thread.id}
          role={thread.role}
          depositEtb={thread.depositEtb}
          holdHours={thread.holdHours}
          priceEtb={thread.listing.priceEtb}
          reservation={thread.reservation}
          outcome={holdOutcome}
          testMode={isChapaMockMode()}
        />

        <ThreadView conversationId={thread.id} initialMessages={thread.messages} />
      </div>
    </div>
  )
}

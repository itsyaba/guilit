import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Eyebrow } from "@/components/kit"
import { ThreadList } from "@/components/messages/thread-list"
import { listConversations } from "@/lib/messaging"
import { getSessionUser } from "@/lib/session"

export const metadata: Metadata = {
  title: "Messages",
  // A private surface. Nothing here should reach an index, ever.
  robots: { index: false, follow: false },
}

/**
 * The inbox.
 *
 * Both roles in one list rather than a Buying/Selling split. On this
 * marketplace the same person does both within a week — someone selling a
 * fridge is usually buying a different one — and a tab bar would make them
 * check two places for the message they were notified about.
 */
export default async function MessagesPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login?next=/messages")

  const threads = await listConversations(user.id)
  const unread = threads.reduce((total, thread) => total + thread.unread, 0)

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 sm:px-6 lg:pt-10 lg:pb-28">
      <header className="mb-8">
        <Eyebrow dot={unread > 0}>
          {unread > 0 ? `${unread} unread` : "Messages"}
        </Eyebrow>
        <h1 className="type-display mt-4 text-2xl font-semibold text-foreground sm:text-3xl">
          Your conversations
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          Threads about items listed on Gulit. Listings indexed from Telegram
          channels are contacted in the channel they came from — that seller
          never signed up here, and their own post is the honest place to reach
          them.
        </p>
      </header>

      <ThreadList threads={threads} />
    </div>
  )
}

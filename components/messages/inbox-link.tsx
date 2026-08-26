import Link from "next/link"
import { IconMessageCircle } from "@tabler/icons-react"

import { getLang, strings } from "@/lib/i18n"
import { unreadMessageCount } from "@/lib/messaging"
import { getSessionUserId } from "@/lib/session"
import { cn } from "@/lib/utils"

/**
 * Inbox entry point in the header.
 *
 * Renders nothing when nobody is signed in — an empty inbox link is a control
 * that only teaches you that you cannot use it.
 *
 * Reads the session id rather than the full user: this runs on every route and
 * the badge needs an id, not a row, so it skips the users lookup and the
 * admin-promotion write that getSessionUser does.
 *
 * On phones the label drops and the icon carries it, which keeps the bar at one
 * row on a 390px screen. The count is still announced.
 */
export async function InboxLink() {
  const userId = await getSessionUserId()
  if (!userId) return null

  const [unread, lang] = await Promise.all([
    unreadMessageCount(userId),
    getLang(),
  ])
  const s = strings(lang)

  return (
    <Link
      href="/messages"
      className={cn(
        "relative inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground",
        "transition-colors duration-500 ease-fluid hover:text-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      )}
    >
      <IconMessageCircle
        aria-hidden="true"
        stroke={1.5}
        className="size-5 sm:hidden"
      />
      <span className="hidden sm:inline">{s.navMessages}</span>

      {unread > 0 ? (
        <span className="type-ledger inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}

      {unread > 0 ? (
        <span className="sr-only">
          {unread} {s.navMessagesUnread}
        </span>
      ) : null}
    </Link>
  )
}

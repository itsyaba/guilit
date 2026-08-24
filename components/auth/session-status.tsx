import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { getLang, strings } from "@/lib/i18n"
import { getSessionUser } from "@/lib/session"
import { cn } from "@/lib/utils"

export async function SessionStatus({ className }: { className?: string }) {
  const [user, lang] = await Promise.all([getSessionUser(), getLang()])
  const s = strings(lang)

  if (!user) {
    return (
      <Link
        href="/login"
        // Sentence case, sans: this sits in the navbar beside "Browse", not in
        // the ledger register the listing data uses.
        className={cn(
          "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
      >
        {s.logIn}
      </Link>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        className
      )}
    >
      <span>{user.username ? `@${user.username}` : s.signedIn}</span>
      <LogoutButton label={s.logOut} />
    </div>
  )
}

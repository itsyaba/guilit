import Link from "next/link"

import { LogoutButton } from "@/components/auth/logout-button"
import { getSessionUser } from "@/lib/session"
import { cn } from "@/lib/utils"

export async function SessionStatus({ className }: { className?: string }) {
  const user = await getSessionUser()

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(
          "type-ledger text-muted-foreground transition-colors hover:text-foreground",
          className
        )}
      >
        Log in
      </Link>
    )
  }

  return (
    <div className={cn("type-ledger flex items-center gap-2 text-muted-foreground", className)}>
      <span>{user.username ? `@${user.username}` : "Signed in"}</span>
      <LogoutButton />
    </div>
  )
}

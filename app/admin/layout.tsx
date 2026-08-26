import { forbidden } from "next/navigation"
import Link from "next/link"

import { ForbiddenError, requireAdmin, UnauthorizedError } from "@/lib/session"
import { AdminNav } from "./components/admin-nav"

export const metadata = {
  title: {
    template: "%s · Admin · Gulit",
    default: "Admin · Gulit",
  },
}

/**
 * The console's frame.
 *
 * Two things about it are deliberate. The header is a floating pill inset from
 * the edges rather than a full-width bar ruled off from the page, which is the
 * same object the public site's header is -- a moderator switching between the
 * two should not feel like they changed products. And the sidebar is a tray
 * with a white core inside it, so the nav reads as an instrument sitting on the
 * page instead of a column of links with a rule down one side.
 *
 * `min-h-[100dvh]`, not `min-h-screen`: on iOS Safari `100vh` counts the URL
 * bar that is about to retract, so the body row ends up taller than the window
 * and the whole console scrolls a few pixels for no reason.
 *
 * The nav appears twice on purpose -- vertically in the tray on a wide screen,
 * and as a scrolling rail above the content below `lg`. The console used to be
 * unusable on a phone, which is where a moderator actually is when a report
 * comes in on a Sunday.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof UnauthorizedError) {
      forbidden()
    }
    throw err
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="mx-auto flex max-w-[110rem] items-center gap-3 rounded-full bg-card/85 px-4 py-2 shadow-ambient ring-1 ring-hairline backdrop-blur supports-backdrop-filter:bg-card/70">
          <Link
            href="/"
            className="type-display shrink-0 font-semibold tracking-tight text-foreground transition-colors duration-500 ease-fluid hover:text-primary"
          >
            Gulit
          </Link>
          <span className="type-ledger rounded-full bg-tray px-2.5 py-1 text-muted-foreground ring-1 ring-hairline">
            Console
          </span>

          <div className="flex-1" />

          <span className="type-ledger type-mixed truncate text-muted-foreground">
            <span className="hidden sm:inline">Signed in as </span>
            <span className="font-medium text-foreground">
              {admin.username || "Admin"}
            </span>
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[110rem] flex-1 gap-4 overflow-hidden p-3 sm:p-4">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="flex h-full min-h-0 flex-col rounded-shell bg-tray p-2 ring-1 ring-hairline">
            <div className="min-h-0 flex-1 overflow-y-auto rounded-panel bg-card p-2 shadow-ambient ring-1 ring-hairline">
              <AdminNav />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="shrink-0 lg:hidden">
            <AdminNav orientation="horizontal" />
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    </div>
  )
}

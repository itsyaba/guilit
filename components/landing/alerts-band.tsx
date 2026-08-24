import Link from "next/link"

import { AlertForm } from "@/components/landing/alert-form"
import { buttonVariants } from "@/components/ui/button"
import { strings, type Lang } from "@/lib/i18n"

/**
 * Saved-search alerts.
 *
 * The one thing here that no incumbent can do: Jiji can only tell you when Jiji
 * gets a listing, and we watch every channel they do not. So this is a value
 * prop the architecture earns rather than a feature bullet.
 *
 * Signed out, the entry point is a sign-in link and says why -- an alert has to
 * belong to somebody we can message on Telegram. Rendering a form that silently
 * discards what you typed would be worse than saying so.
 */
export function AlertsBand({
  lang,
  signedIn,
}: {
  lang: Lang
  signedIn: boolean
}) {
  const s = strings(lang)

  return (
    <section aria-labelledby="alerts-heading" className="border-b border-border">
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:py-20">
        <h2
          id="alerts-heading"
          className="type-display mx-auto max-w-[24ch] text-2xl font-semibold text-balance text-foreground sm:text-3xl"
        >
          {s.alertsTitle}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          {s.alertsLede}
        </p>

        {signedIn ? (
          <AlertForm
            label={s.alertsLabel}
            placeholder={s.alertsPlaceholder}
            action={s.alertsAction}
            saved={s.alertsSaved}
            failed={s.alertsFailed}
            className="mx-auto mt-8 max-w-xl"
          />
        ) : (
          <div className="mt-8">
            <Link
              href="/login?next=/"
              className={buttonVariants({ size: "lg" })}
            >
              {s.alertsAction}
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              {s.alertsSignedOut}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

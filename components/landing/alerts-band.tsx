import { AlertForm } from "@/components/landing/alert-form"
import { Band, CtaLink, Eyebrow, Shell } from "@/components/kit"
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
 *
 * One of the two accent-tinted enclosures on the page, and the pair is
 * deliberate: this and the sell band are the only two places asking for
 * something back, so they are the only two that are lit.
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
    <Band labelledBy="alerts-heading">
      <Shell
        tone="accent"
        className="mx-auto max-w-4xl"
        coreClassName="relative isolate overflow-hidden px-5 py-12 text-center sm:px-10 lg:py-16"
      >
        <div
          aria-hidden="true"
          className="bg-wash pointer-events-none absolute inset-0 -z-10"
        />

        <Eyebrow>{s.eyebrowAlerts}</Eyebrow>

        <h2
          id="alerts-heading"
          className="type-section type-display mx-auto mt-5 max-w-[22ch] font-semibold text-balance text-foreground"
        >
          {s.alertsTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
          {s.alertsLede}
        </p>

        {signedIn ? (
          <AlertForm
            label={s.alertsLabel}
            placeholder={s.alertsPlaceholder}
            action={s.alertsAction}
            saved={s.alertsSaved}
            failed={s.alertsFailed}
            className="mx-auto mt-9 max-w-xl"
          />
        ) : (
          <div className="mt-9">
            <CtaLink href="/login?next=/">{s.alertsAction}</CtaLink>
            <p className="mt-4 text-sm text-muted-foreground">
              {s.alertsSignedOut}
            </p>
          </div>
        )}
      </Shell>
    </Band>
  )
}

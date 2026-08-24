import { headers } from "next/headers"

import { getLang, strings, type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "am", label: "አማ" },
  { value: "en", label: "EN" },
]

/**
 * Interface language switch.
 *
 * A form, not a click handler. Switching to Amharic works on a phone that never
 * finished downloading our JavaScript -- which is disproportionately the phone
 * that wanted Amharic. POST /api/lang sets the cookie and 303s back to the page
 * you were on, so the whole thing costs zero client bytes and cannot get out of
 * step with what the server rendered.
 *
 * The current language comes from the cookie rather than from state, so there is
 * no first-paint flash of the wrong language and nothing to hydrate.
 */
export async function LanguageToggle({ className }: { className?: string }) {
  const [lang, headerList] = await Promise.all([getLang(), headers()])
  const s = strings(lang)

  // Come back to the page the reader was actually on. The proxy sets this on
  // every page request; the route handler re-validates it as a relative path
  // before redirecting, so a spoofed header cannot bounce anyone off-site.
  const returnTo = headerList.get("x-gulit-path") ?? "/"

  return (
    <form
      action="/api/lang"
      method="post"
      role="group"
      aria-label={s.langGroupLabel}
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border border-border p-0.5",
        className
      )}
    >
      <input type="hidden" name="to" value={returnTo} />

      {LANGUAGES.map((option) => {
        const active = option.value === lang
        return (
          <button
            key={option.value}
            type="submit"
            name="lang"
            value={option.value}
            aria-pressed={active}
            lang={option.value}
            className={cn(
              // 28px tall inside a 44px-tall header row. The row is the tap
              // target; two of these side by side at 44px each would push the
              // actions group off a 390px screen.
              "min-w-9 rounded-md px-2 py-1.5 text-xs leading-none font-medium",
              "transition-colors duration-500 ease-fluid",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden="true">{option.label}</span>
            <span className="sr-only">
              {option.value === "am" ? s.langAmharic : s.langEnglish}
            </span>
          </button>
        )
      })}
    </form>
  )
}

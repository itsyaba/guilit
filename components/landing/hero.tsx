import { HeroSearch } from "@/components/landing/hero-search"
import { CtaLink, Eyebrow } from "@/components/kit"
import { formatAmount } from "@/lib/format"
import { formatAgo, strings, type Lang } from "@/lib/i18n"
import type { LandingStats } from "@/lib/landing"

/**
 * Phrases a shopper can tap, kept in their original scripts in both languages.
 *
 * The middle one is the case the incumbents handle worst and the shape most of
 * our supply is written in: an Amharic noun with an English price qualifier.
 */
const EXAMPLES = [
  "laptop in Bole under 20000",
  "ላፕቶፕ under 20000",
  "iPhone under 40000",
] as const

/**
 * The front page above the fold.
 *
 * The search field is the object on this screen, not an accessory under a
 * headline: it is the widest, tallest and highest-contrast thing here, it is
 * focused on load on a desktop, and the first row of real stock sits directly
 * under it rather than behind a scroll.
 *
 * The light behind it is two radial washes and a 4rem lattice, painted into two
 * fixed-height absolute elements with no filter on either. That distinction is
 * the whole reason it is allowed to be here: a gradient is one paint, whereas
 * the `backdrop-blur` this look usually reaches for would repaint the GPU on
 * every scroll frame of a page this long -- on the mid-range Android this is
 * aimed at, that is the difference between a smooth page and a stuttering one.
 *
 * The five figures that used to sit in a row under the field have moved into
 * the index band, which is a better place to compare them. What is left here is
 * the one line a visitor needs before they trust the box: how much is in it and
 * when we last looked.
 */
export function LandingHero({
  stats,
  lang,
}: {
  stats: LandingStats
  lang: Lang
}) {
  const s = strings(lang)
  const empty = stats.liveListings === 0

  return (
    <section className="relative isolate overflow-hidden">
      {/* Decoration, and inert in every sense: aria-hidden, pointer-events
          none, behind the content, and a plain background-image rather than a
          filter, so it costs one paint and never repaints on scroll. */}
      <div
        aria-hidden="true"
        className="bg-wash pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem]"
      />
      <div
        aria-hidden="true"
        className="bg-lattice pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem]"
      />

      <div className="mx-auto max-w-3xl px-4 pt-14 pb-12 text-center sm:px-6 lg:pt-24 lg:pb-16">
        {empty ? null : (
          <div className="anim-rise">
            <Eyebrow dot>
              {formatAmount(stats.channelCount)} {s.statChannels}
              {stats.lastCapturedAt ? (
                <>
                  <span aria-hidden="true" className="text-muted-foreground/50">
                    ·
                  </span>
                  {s.capturedAgo(formatAgo(stats.lastCapturedAt, lang))}
                </>
              ) : null}
            </Eyebrow>
          </div>
        )}

        <h1
          className="anim-rise type-hero type-display mt-7 font-semibold text-balance text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          {empty ? s.freshTitle : s.heroTitle}
        </h1>

        <p
          className="anim-rise mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]"
          style={{ animationDelay: "120ms" }}
        >
          {empty ? s.freshLede : s.heroLede}
        </p>

        <HeroSearch
          examples={EXAMPLES}
          label={s.searchLabel}
          placeholder={s.searchPlaceholder}
          action={s.searchAction}
          className="anim-rise mx-auto mt-10"
          style={{ animationDelay: "180ms" }}
        />

        {empty ? null : (
          <div
            className="anim-rise mt-10 flex justify-center"
            style={{ animationDelay: "240ms" }}
          >
            <CtaLink href="/browse" tone="quiet">
              {s.browseAll(formatAmount(stats.liveListings))}
            </CtaLink>
          </div>
        )}
      </div>
    </section>
  )
}

import { Band, Eyebrow, Shell } from "@/components/kit"
import { conditionLabel, formatAmount } from "@/lib/format"
import { strings, type Lang } from "@/lib/i18n"
import type { LandingPriceBucket } from "@/lib/landing"
import { cn } from "@/lib/utils"

/**
 * The four things we will tell you about a price.
 *
 * Amber is the only warning colour in the product and it is reserved for this:
 * a price far enough below the typical range that it is a common advance
 * payment scam signal. Naming that state on the front page is the point. A
 * bargain and a trap look identical in a channel post.
 */
function verdicts(lang: Lang): { label: string; body: string; flag?: boolean }[] {
  const s = strings(lang)
  return [
    { label: s.verdictBelow, body: s.verdictBelowBody },
    { label: s.verdictTypical, body: s.verdictTypicalBody },
    { label: s.verdictAbove, body: s.verdictAboveBody },
    { label: s.verdictSuspicious, body: s.verdictSuspiciousBody, flag: true },
  ]
}

/**
 * Price fairness, quoted from the table that actually powers it.
 *
 * The bucket shown is whichever comparison set has the most sales behind it, so
 * the figures move as the index grows. The panel disappears when the table is
 * empty rather than printing a range built from nothing.
 */
export function PriceFairness({
  bucket,
  lang,
}: {
  bucket: LandingPriceBucket | null
  lang: Lang
}) {
  const s = strings(lang)

  // Where the median falls inside the middle half. Clamped because a skewed
  // bucket can put the median on the quartile itself.
  const span = bucket ? bucket.p75Etb - bucket.p25Etb : 0
  const medianOffset =
    bucket && span > 0
      ? Math.min(
          92,
          Math.max(8, ((bucket.medianEtb - bucket.p25Etb) / span) * 100)
        )
      : 50

  return (
    <Band labelledBy="price-heading">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="min-w-0">
          <Eyebrow dot={bucket !== null}>{s.eyebrowPrice}</Eyebrow>

          <h2
            id="price-heading"
            className="type-section type-display mt-5 max-w-[18ch] font-semibold text-foreground"
          >
            {s.priceTitle}
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
            {s.priceLede}
          </p>

          {bucket ? (
            <Shell className="mt-8" coreClassName="p-6 sm:p-7">
              <p className="type-ledger type-mixed text-muted-foreground">
                {bucket.categoryLabel},{" "}
                {conditionLabel(bucket.condition, lang)}
              </p>

              <p className="type-figure type-display mt-4 text-[clamp(2.25rem,5vw,3rem)] leading-none text-foreground">
                {formatAmount(bucket.medianEtb)}
                <span className="ml-2 align-baseline text-base font-normal text-muted-foreground">
                  ETB
                </span>
              </p>
              <p className="type-ledger type-mixed mt-2 text-muted-foreground">
                {s.priceTypical}
              </p>

              {/* The middle half, drawn to scale between the two quartiles.
                  No track behind it: the comparison is the span itself. */}
              <div className="mt-7">
                <div className="flex items-baseline justify-between text-sm text-muted-foreground tabular-nums">
                  <span>{formatAmount(bucket.p25Etb)}</span>
                  <span>{formatAmount(bucket.p75Etb)}</span>
                </div>
                <div className="relative mt-2 h-2 rounded-full bg-primary/75">
                  <span
                    aria-hidden="true"
                    style={{ left: `${medianOffset}%` }}
                    className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {s.priceRange(formatAmount(bucket.sampleSize))}
                </p>
              </div>
            </Shell>
          ) : null}
        </div>

        {/*
         * The four verdicts as their own tiles. Three of them are white cores;
         * the fourth carries the flag surface, which is the only place on this
         * page allowed to use it.
         */}
        <dl className="grid content-start gap-4 sm:grid-cols-2">
          {verdicts(lang).map((verdict) => (
            <div
              key={verdict.label}
              className={cn(
                "rounded-panel p-5 shadow-hairline ring-1 sm:p-6",
                "transition-shadow duration-500 ease-fluid hover:shadow-ambient",
                verdict.flag
                  ? "bg-flag-surface ring-flag/35"
                  : "bg-card ring-hairline"
              )}
            >
              <dt
                className={cn(
                  "text-sm font-medium",
                  verdict.flag ? "text-flag-foreground" : "text-foreground"
                )}
              >
                {verdict.label}
              </dt>
              <dd
                className={cn(
                  "mt-2 text-sm leading-relaxed",
                  verdict.flag
                    ? "text-flag-foreground/85"
                    : "text-muted-foreground"
                )}
              >
                {verdict.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Band>
  )
}

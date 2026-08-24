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
 * the figures move as the index grows. The section disappears when the table is
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
    <section aria-labelledby="price-heading" className="border-b border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div className="min-w-0">
            <h2
              id="price-heading"
              className="type-display max-w-[20ch] text-2xl font-semibold text-foreground sm:text-3xl"
            >
              {s.priceTitle}
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              {s.priceLede}
            </p>

            {bucket ? (
              <div className="mt-8 rounded-4xl border border-border bg-card p-5 sm:p-6">
                <p className="type-ledger text-muted-foreground">
                  {bucket.categoryLabel}, {conditionLabel(bucket.condition, lang)}
                </p>

                <p className="mt-3 text-3xl font-semibold text-foreground tabular-nums">
                  {formatAmount(bucket.medianEtb)}
                  <span className="ml-1.5 text-base font-normal text-muted-foreground">
                    ETB
                  </span>
                </p>
                <p className="type-ledger mt-1 text-muted-foreground">
                  {s.priceTypical}
                </p>

                {/* The middle half, drawn to scale between the two quartiles.
                    No track behind it: the comparison is the span itself. */}
                <div className="mt-6">
                  <div className="flex items-baseline justify-between text-sm text-muted-foreground tabular-nums">
                    <span>{formatAmount(bucket.p25Etb)}</span>
                    <span>{formatAmount(bucket.p75Etb)}</span>
                  </div>
                  {/* The middle half as a bar, with the median marked on it.
                      No track behind it: the span is the information. */}
                  <div className="relative mt-2 h-1.5 rounded-full bg-primary/70">
                    <span
                      aria-hidden="true"
                      style={{ left: `${medianOffset}%` }}
                      className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {s.priceRange(formatAmount(bucket.sampleSize))}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <dl className="grid content-start gap-4 sm:grid-cols-2">
            {verdicts(lang).map((verdict) => (
              <div
                key={verdict.label}
                className={cn(
                  "rounded-4xl border p-5",
                  verdict.flag
                    ? "border-flag/40 bg-flag-surface"
                    : "border-border bg-card"
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
                    "mt-1.5 text-sm leading-relaxed",
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
      </div>
    </section>
  )
}

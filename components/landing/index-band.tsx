import { formatAmount } from "@/lib/format"
import {
  STALE_AFTER_HOURS,
  formatAgo,
  hoursSince,
  strings,
  type Lang,
} from "@/lib/i18n"
import type { LandingStats } from "@/lib/landing"

/**
 * What the index actually holds.
 *
 * These are the numbers a visiting engineer checks first, so they are read live
 * out of Postgres and stated without decoration. Figures on one hairline, no
 * cards: a box around a number adds nothing to the number.
 *
 * When capture has stalled the band grows rather than hides. A front page that
 * quietly keeps showing "489 listings" while the listener has been dead for two
 * days is lying by omission, and the backlog figure is the one number that tells
 * an operator where to look.
 */
export function IndexBand({
  stats,
  lang,
}: {
  stats: LandingStats
  lang: Lang
}) {
  const s = strings(lang)
  if (stats.liveListings === 0) return null

  const stale =
    stats.lastCapturedAt !== null &&
    hoursSince(stats.lastCapturedAt) > STALE_AFTER_HOURS

  const entries = [
    { label: s.statListings, value: formatAmount(stats.liveListings) },
    { label: s.statChannels, value: formatAmount(stats.channelCount) },
    stats.collapsed > 0
      ? { label: s.statMerged, value: formatAmount(stats.collapsed) }
      : null,
    {
      label: s.statCaptured,
      value: stats.lastCapturedAt
        ? formatAgo(stats.lastCapturedAt, lang)
        : s.noCaptureYet,
    },
    // Only when there is a backlog. A zero here is noise.
    stale && stats.pendingDedup > 0
      ? { label: s.statPending, value: formatAmount(stats.pendingDedup) }
      : null,
  ].filter((entry): entry is { label: string; value: string } => entry !== null)

  return (
    <section aria-label={s.indexHeading} className="border-b border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-10 sm:px-6 lg:py-12">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-4 lg:grid-cols-5">
          {entries.map((entry) => (
            <div key={entry.label} className="min-w-0">
              <dd className="type-display text-2xl font-semibold text-foreground tabular-nums sm:text-3xl">
                {entry.value}
              </dd>
              {/* Label under the number: the figure is the message, the label
                  is the footnote. */}
              <dt className="type-ledger mt-1.5 text-muted-foreground">
                {entry.label}
              </dt>
            </div>
          ))}
        </dl>

        {/*
         * Stated in words, not in colour. Amber in this product means one thing
         * -- a price far enough below the range to be a scam signal -- and
         * spending it on an operational problem would blunt the only warning
         * that has to cut through.
         */}
        {stale && stats.lastCapturedAt ? (
          <p className="mt-8 max-w-2xl border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">
            {s.captureStalled(formatAgo(stats.lastCapturedAt, lang))}
          </p>
        ) : null}
      </div>
    </section>
  )
}

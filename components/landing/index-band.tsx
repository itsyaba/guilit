import { Band, Eyebrow, Shell } from "@/components/kit"
import { formatAmount } from "@/lib/format"
import {
  STALE_AFTER_HOURS,
  formatAgo,
  hoursSince,
  strings,
  type Lang,
} from "@/lib/i18n"
import type { LandingStats } from "@/lib/landing"
import { cn } from "@/lib/utils"

/**
 * What the index actually holds.
 *
 * These are the numbers a visiting engineer checks first, so they are read live
 * out of Postgres and stated without decoration -- the figure is the message and
 * the label is the footnote, which is why the label sits underneath.
 *
 * The row of five bare figures became a bento: one large enclosure for the
 * count everything else qualifies, and tiles for the rest. The asymmetry is
 * doing work rather than being a style -- five equal-weight numbers side by side
 * gave "posts awaiting dedup" the same visual claim as "listings live", and they
 * are not the same claim.
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

  const tiles = [
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
  ].filter((tile): tile is { label: string; value: string } => tile !== null)

  // Three tiles in a two-column grid leaves a hole; the odd one out takes the
  // full width instead of sitting beside empty space.
  const odd = tiles.length % 2 === 1

  return (
    <Band label={s.indexHeading}>
      <Eyebrow dot>{s.indexHeading}</Eyebrow>

      <dl className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* The count everything else on the page qualifies. */}
        <Shell coreClassName="flex h-full flex-col justify-between gap-8 p-6 sm:p-8">
          <div>
            <dd className="type-figure type-display text-[clamp(2.75rem,7vw,4rem)] leading-none text-foreground">
              {formatAmount(stats.liveListings)}
            </dd>
            <dt className="type-ledger type-mixed mt-3 text-muted-foreground">
              {s.statListings}
            </dt>
          </div>

          {/* The figure that makes the headline count mean something: this
              many Telegram posts stand behind those listings. */}
          <div className="border-t border-hairline pt-4">
            <dd className="type-figure text-lg text-foreground">
              {formatAmount(stats.sightings)}
            </dd>
            <dt className="type-ledger type-mixed mt-1 text-muted-foreground">
              {s.statSightings}
            </dt>
          </div>
        </Shell>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-2">
          {tiles.map((tile, index) => (
            <Shell
              key={tile.label}
              coreClassName="flex h-full flex-col justify-end gap-3 p-5 sm:p-6"
              className={cn(odd && index === tiles.length - 1 && "col-span-2")}
            >
              <dd className="type-figure type-display text-3xl text-foreground sm:text-[2.125rem]">
                {tile.value}
              </dd>
              {/* Label under the number: the figure is the message, the label
                  is the footnote. */}
              <dt className="type-ledger type-mixed text-muted-foreground">
                {tile.label}
              </dt>
            </Shell>
          ))}
        </div>
      </dl>

      {/*
       * Stated in words, not in colour. Amber in this product means one thing
       * -- a price far enough below the range to be a scam signal -- and
       * spending it on an operational problem would blunt the only warning
       * that has to cut through.
       */}
      {stale && stats.lastCapturedAt ? (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {s.captureStalled(formatAgo(stats.lastCapturedAt, lang))}
        </p>
      ) : null}
    </Band>
  )
}

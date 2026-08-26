import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  IconAntenna,
  IconArrowUpRight,
  IconChecklist,
  IconFlag,
  IconTrash,
} from "@tabler/icons-react"

import { CtaLink, Eyebrow, Shell } from "@/components/kit"
import { getAdminStats } from "@/lib/admin-stats"
import { formatAmount } from "@/lib/format"
import { requireAdmin } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Overview",
}

/**
 * The console's front door.
 *
 * This route used to redirect straight to the queue, which meant the only way
 * to find out that eleven removal requests had been sitting for a week was to
 * go looking for them. A moderator's first question is "what is waiting for
 * me", and that question has five answers across five tables, so the answer is
 * a page rather than a redirect.
 *
 * The layout is deliberately asymmetric: queue depth is the number the shift
 * is planned around and it gets four tiles' worth of space, while the figures
 * you check rather than act on sit in the column beside it. A row of six equal
 * cards would say all six matter equally, which is false.
 */
export default async function AdminOverviewPage() {
  await requireAdmin()

  const stats = await getAdminStats()

  const captured = stats.ingest.lastCapturedAt
    ? formatDistanceToNow(new Date(stats.ingest.lastCapturedAt), {
        addSuffix: true,
      })
    : "never"

  return (
    <div className="anim-rise mx-auto max-w-[80rem] px-1 pb-16 sm:px-2">
      <header className="max-w-2xl">
        <Eyebrow dot>Console</Eyebrow>
        <h1 className="type-section type-display mt-4 font-semibold text-foreground">
          What is waiting for you
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Live counts, read straight from Postgres on every load. Nothing here
          is cached, because a stale queue depth sends someone to an empty
          queue.
        </p>
      </header>

      {/*
       * Bento rather than a strip of equal cards: the queue tile spans two
       * columns and two rows on a wide screen and collapses to a full-width
       * block below `sm`, where every tile is one column and nothing spans.
       */}
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Shell
          tone="accent"
          className="sm:col-span-2 lg:row-span-2"
          coreClassName="flex h-full flex-col justify-between gap-8 p-6 sm:p-8"
        >
          <div>
            <Eyebrow tone="quiet">
              <IconChecklist
                aria-hidden="true"
                stroke={1.5}
                className="size-3.5"
              />
              Moderation queue
            </Eyebrow>

            <p className="type-figure type-display mt-6 text-[clamp(3rem,8vw,4.5rem)] leading-none text-foreground">
              {formatAmount(stats.queue.depth)}
            </p>

            <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
              {stats.queue.depth === 0
                ? "Nothing is waiting for a decision."
                : `Awaiting a decision. ${formatAmount(stats.queue.today)} of them arrived in the last 24 hours.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CtaLink href="/admin/queue">
              {stats.queue.depth === 0 ? "Open the queue" : "Start clearing"}
            </CtaLink>
            <span className="type-ledger text-muted-foreground">
              J / K · A · E · R
            </span>
          </div>
        </Shell>

        <Tile
          href="/admin/removals"
          icon={
            <IconTrash aria-hidden="true" stroke={1.5} className="size-4" />
          }
          label="Pending removals"
          value={stats.removals.pending}
          note="Takedown claims from original posters"
          urgent={stats.removals.pending > 0}
        />

        <Tile
          href="/admin/reports"
          icon={<IconFlag aria-hidden="true" stroke={1.5} className="size-4" />}
          label="Reports this week"
          value={stats.reports.week}
          note={`${formatAmount(stats.reports.total)} since launch`}
        />

        <Tile
          href="/admin/channels"
          icon={
            <IconAntenna aria-hidden="true" stroke={1.5} className="size-4" />
          }
          label="Active channels"
          value={stats.channels.active}
          note={`of ${formatAmount(stats.channels.total)} allowlisted`}
        />

        <Tile
          label="Extraction backlog"
          value={stats.ingest.unprocessed}
          note={`of ${formatAmount(stats.ingest.messages)} captured messages`}
          urgent={stats.ingest.unprocessed > 500}
        />
      </div>

      {/* The index's own state, in the ledger register: figures you read, not
          figures you act on. */}
      <Shell className="mt-4" coreClassName="overflow-hidden">
        {/* The rules between cells are the gap itself, showing the tray colour
            through -- one hairline per edge instead of a border per cell. */}
        <dl className="grid gap-px bg-hairline sm:grid-cols-4">
          <Ledger label="Live" value={formatAmount(stats.listings.live)} />
          <Ledger label="Hidden" value={formatAmount(stats.listings.hidden)} />
          <Ledger
            label="Removed"
            value={formatAmount(stats.listings.removed)}
          />
          <Ledger label="Last capture" value={captured} />
        </dl>
      </Shell>
    </div>
  )
}

/**
 * One figure, optionally a link into the section that owns it. The arrow chip
 * only appears on the linked ones, so a tile you can act on and a tile you can
 * only read are distinguishable without hovering.
 */
function Tile({
  href,
  icon,
  label,
  value,
  note,
  urgent = false,
}: {
  href?: string
  icon?: React.ReactNode
  label: string
  value: number
  note: string
  /** Colours the figure with the flag amber. Reserved for a backlog someone
   *  should act on today, never used decoratively. */
  urgent?: boolean
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="type-ledger type-mixed inline-flex items-center gap-2 rounded-full bg-tray px-3 py-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        {href ? (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground",
              "transition-transform duration-500 ease-fluid",
              "group-hover/tile:translate-x-0.5 group-hover/tile:-translate-y-px group-hover/tile:scale-105"
            )}
          >
            <IconArrowUpRight stroke={1.5} className="size-4" />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "type-figure type-display mt-6 text-4xl leading-none",
          urgent ? "text-flag-foreground" : "text-foreground"
        )}
      >
        {formatAmount(value)}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {note}
      </p>
    </>
  )

  const core = cn(
    "flex h-full flex-col p-6",
    href &&
      "transition-shadow duration-500 ease-fluid group-hover/tile:shadow-lift"
  )

  if (!href) {
    return <Shell coreClassName={core}>{body}</Shell>
  }

  return (
    <Link
      href={href}
      className="group/tile block rounded-shell focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
    >
      <Shell className="h-full" coreClassName={core}>
        {body}
      </Shell>
    </Link>
  )
}

function Ledger({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-5">
      <dt className="type-ledger text-muted-foreground">{label}</dt>
      <dd className="type-figure type-display mt-2 text-xl text-foreground">
        {value}
      </dd>
    </div>
  )
}

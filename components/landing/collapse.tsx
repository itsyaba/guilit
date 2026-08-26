import Link from "next/link"
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUpRight,
} from "@tabler/icons-react"

import { Band, BandHead, Shell } from "@/components/kit"
import { formatAmount, formatShortDate } from "@/lib/format"
import { strings, type Lang } from "@/lib/i18n"
import type { LandingCluster, LandingSighting } from "@/lib/landing"
import { cn } from "@/lib/utils"

/**
 * The dedup demonstration, from a live row in our own index.
 *
 * This is the one non-obvious thing Gulit does, so it is shown rather than
 * claimed. On the left, every Telegram post behind one listing, quoted as it was
 * written -- two different Amharic phrasings, a mixed-script line, a full
 * English sentence -- with the phone number marked in each. On the right, the
 * single row a shopper sees.
 *
 * The marked number is the argument. Four posts with four wordings and four
 * prices could be four different sofas; four posts carrying one phone number
 * could not. Nothing on this page is claimed in prose that could be shown this
 * way instead.
 *
 * The two sides are deliberately unequal enclosures: the posts are a plain white
 * core, the result sits in an accent-tinted tray. That is the whole diagram --
 * raw material on the left, the thing we made on the right -- and it does the
 * job the old matching pair of bordered boxes needed a caption for.
 *
 * A fabricated example here would undo the exact point it is making, so when the
 * index holds nothing cross-posted the section says so.
 */
export function Collapse({
  cluster,
  lang,
}: {
  cluster: LandingCluster | null
  lang: Lang
}) {
  const s = strings(lang)
  if (!cluster) return null

  const { sightings, lowestPriceEtb, highestPriceEtb } = cluster
  const spread =
    lowestPriceEtb !== null && highestPriceEtb !== null
      ? highestPriceEtb - lowestPriceEtb
      : 0
  const posts = sightings.length

  return (
    <Band labelledBy="collapse-heading">
      <BandHead
        eyebrow={s.eyebrowMerge}
        title={s.collapseTitle(posts)}
        titleId="collapse-heading"
        lede={s.collapseLede(cluster.distinctChannels)}
      />

      <div className="mt-10 grid items-stretch gap-4 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,24rem)] lg:gap-0">
        {/* ---- the posts -------------------------------------------------- */}
        <Shell coreClassName="overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3.5 sm:px-5">
            <p className="type-ledger type-mixed text-muted-foreground">
              {s.collapseLedger(posts, cluster.distinctChannels)}
            </p>
            {cluster.phoneNormalized ? (
              <p className="font-mono text-xs text-foreground tabular-nums">
                {cluster.phoneNormalized}
              </p>
            ) : null}
          </div>

          <ul className="min-w-0 divide-y divide-hairline">
            {sightings.map((sighting, index) => (
              <Post
                key={`${sighting.channelHandle}-${sighting.messageId}-${index}`}
                sighting={sighting}
                lowest={lowestPriceEtb}
              />
            ))}
          </ul>
        </Shell>

        {/* ---- the funnel ------------------------------------------------- */}
        {/*
          * One arrow in one circle, rotated by breakpoint. The first pass drew
          * a bracket out of borders, which at the width this column gets read
          * as a stray hairline rather than as a convergence -- it looked like a
          * rendering artifact next to the card it was pointing at.
          */}
        <div
          aria-hidden="true"
          className="flex justify-center lg:items-center"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-hairline ring-1 ring-hairline">
            <IconArrowDown stroke={1.5} className="size-4 lg:hidden" />
            <IconArrowRight stroke={1.5} className="hidden size-4 lg:block" />
          </span>
        </div>

        {/* ---- the one listing -------------------------------------------- */}
        <Shell
          tone="accent"
          coreClassName="flex h-full min-w-0 flex-col justify-center px-5 py-6 sm:px-6"
        >
          <p className="type-ledger type-mixed text-muted-foreground">
            {s.collapseResult}
          </p>

          <h3
            className="mt-2 text-base leading-relaxed font-medium text-foreground"
            lang="am"
          >
            {cluster.title}
          </h3>

          <p className="type-figure mt-3 text-2xl text-foreground">
            {lowestPriceEtb === null
              ? s.priceOnRequest
              : s.collapseFrom(formatAmount(lowestPriceEtb))}
          </p>

          <p className="type-ledger type-mixed mt-2 text-muted-foreground normal-case">
            {cluster.categoryLabel}
            {cluster.area ? ` · ${cluster.area}` : ""}
          </p>

          {spread > 0 ? (
            <p className="mt-5 border-t border-hairline pt-4 text-sm leading-relaxed text-muted-foreground">
              {s.collapseSpread(formatAmount(spread))}
            </p>
          ) : null}

          <Link
            href={`/listing/${cluster.id}`}
            className={cn(
              "group/open mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground",
              "transition-colors duration-500 ease-fluid hover:text-primary",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          >
            {s.collapseOpen}
            <IconArrowUpRight
              aria-hidden="true"
              stroke={1.5}
              className="size-4 transition-transform duration-500 ease-fluid group-hover/open:translate-x-px group-hover/open:-translate-y-px"
            />
          </Link>
        </Shell>
      </div>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {s.collapseHow}
      </p>
    </Band>
  )
}

function Post({
  sighting,
  lowest,
}: {
  sighting: LandingSighting
  lowest: number | null
}) {
  const price = sighting.priceEtb
  const isLowest = price !== null && price === lowest

  return (
    <li className="min-w-0 px-4 py-3.5 transition-colors duration-500 ease-fluid hover:bg-tray/60 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        {/* Telegram handles are lowercase; uppercasing one makes it look wrong,
            so this is the mono register without the ledger's caps. */}
        <a
          href={`https://t.me/${sighting.channelHandle}/${sighting.messageId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "min-w-0 truncate font-mono text-xs text-muted-foreground",
            "transition-colors duration-500 ease-fluid hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          )}
        >
          @{sighting.channelHandle}
        </a>

        <span className="flex shrink-0 items-baseline gap-2">
          <span className="type-ledger text-muted-foreground">
            {formatShortDate(sighting.postedAt)}
          </span>
          <span
            className={cn(
              "text-sm tabular-nums",
              isLowest ? "font-semibold text-primary" : "text-muted-foreground"
            )}
          >
            {price === null ? "—" : formatAmount(price)}
          </span>
        </span>
      </div>

      {sighting.rawText ? (
        // One line, truncated. The full post is a tap away on Telegram, and
        // four wrapped Amharic paragraphs stacked here is a wall nobody reads.
        <p
          lang="am"
          className="mt-1.5 truncate text-sm text-muted-foreground"
          title={sighting.rawText}
        >
          <MarkPhone text={sighting.rawText} phone={sighting.phoneRaw} />
        </p>
      ) : null}
    </li>
  )
}

/**
 * Marks the phone number inside the post that carried it.
 *
 * `indexOf`, not a regular expression: these strings contain `+`, spaces and
 * parentheses, and escaping a user-supplied needle to build a pattern is work
 * with a sharp edge for no gain over a substring search.
 *
 * The number is quoted exactly as that post typed it -- `0911223344` in three of
 * them and `+251 911 22 33 44` in the English one -- because "these are the same
 * number written differently" is precisely the thing dedup had to work out.
 */
function MarkPhone({ text, phone }: { text: string; phone: string | null }) {
  if (!phone) return <>{text}</>

  const at = text.indexOf(phone)
  if (at === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-medium text-foreground underline decoration-primary decoration-2 underline-offset-2">
        {phone}
      </mark>
      {text.slice(at + phone.length)}
    </>
  )
}

/**
 * What the section says when the index holds no cross-posts.
 *
 * A fresh database, or a day when everything happened to be posted once. Naming
 * that is better than hiding the section: 487 of our 489 listings are
 * single-source, and pretending otherwise would misrepresent the corpus.
 */
export function CollapseSingle({
  handle,
  lang,
}: {
  handle: string
  lang: Lang
}) {
  const s = strings(lang)

  return (
    <Band label={s.collapseTitle(1)}>
      <BandHead
        eyebrow={s.eyebrowMerge}
        title={s.collapseTitle(1)}
        lede={s.collapseSingle(handle)}
      />
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {s.collapseSingleNote}
      </p>
    </Band>
  )
}

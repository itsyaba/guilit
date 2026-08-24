import Link from "next/link"
import {
  IconArrowDown,
  IconArrowRight,
  IconArrowUpRight,
} from "@tabler/icons-react"

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
    <section aria-labelledby="collapse-heading" className="border-b border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <h2
          id="collapse-heading"
          className="type-display max-w-[22ch] text-2xl font-semibold text-foreground sm:text-3xl"
        >
          {s.collapseTitle(posts)}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {s.collapseLede(cluster.distinctChannels)}
        </p>

        <div className="mt-9 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_2rem_minmax(0,22rem)] lg:gap-0">
          {/* ---- the posts ------------------------------------------------ */}
          <div className="min-w-0 overflow-hidden rounded-4xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
              <p className="type-ledger text-muted-foreground">
                {s.collapseLedger(posts, cluster.distinctChannels)}
              </p>
              {cluster.phoneNormalized ? (
                <p className="font-mono text-xs text-foreground tabular-nums">
                  {cluster.phoneNormalized}
                </p>
              ) : null}
            </div>

            <ul className="divide-y divide-border">
              {sightings.map((sighting, index) => (
                <Post
                  key={`${sighting.channelHandle}-${sighting.messageId}-${index}`}
                  sighting={sighting}
                  lowest={lowestPriceEtb}
                  lang={lang}
                />
              ))}
            </ul>
          </div>

          {/* ---- the funnel ----------------------------------------------- */}
          {/*
            * One arrow, rotated by breakpoint. The first pass drew a bracket
            * out of borders, which at the 32px this column gets read as a
            * stray hairline rather than as a convergence -- it looked like a
            * rendering artifact next to the card it was pointing at.
            */}
          <div
            aria-hidden="true"
            className="flex justify-center lg:items-center"
          >
            <IconArrowDown
              stroke={1.5}
              className="size-5 text-muted-foreground lg:hidden"
            />
            <IconArrowRight
              stroke={1.5}
              className="hidden size-5 text-muted-foreground lg:block"
            />
          </div>

          {/* ---- the one listing ------------------------------------------ */}
          <div className="flex min-w-0 flex-col justify-center rounded-4xl border border-border bg-muted/40 px-5 py-6">
            <p className="type-ledger text-muted-foreground">
              {s.collapseResult}
            </p>

            <h3
              className="mt-2 text-base leading-relaxed font-medium text-foreground"
              lang="am"
            >
              {cluster.title}
            </h3>

            <p className="type-price mt-3 text-foreground">
              {lowestPriceEtb === null
                ? s.priceOnRequest
                : s.collapseFrom(formatAmount(lowestPriceEtb))}
            </p>

            <p className="type-ledger mt-1.5 text-muted-foreground normal-case">
              {cluster.categoryLabel}
              {cluster.area ? ` · ${cluster.area}` : ""}
            </p>

            {spread > 0 ? (
              <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
                {s.collapseSpread(formatAmount(spread))}
              </p>
            ) : null}

            <Link
              href={`/listing/${cluster.id}`}
              className={cn(
                "group/open mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground",
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
          </div>
        </div>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {s.collapseHow}
        </p>
      </div>
    </section>
  )
}

function Post({
  sighting,
  lowest,
  lang,
}: {
  sighting: LandingSighting
  lowest: number | null
  lang: Lang
}) {
  const price = sighting.priceEtb
  const isLowest = price !== null && price === lowest

  return (
    <li className="px-4 py-3.5 sm:px-5">
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
    <section className="border-b border-border">
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <h2 className="type-display max-w-[22ch] text-2xl font-semibold text-foreground sm:text-3xl">
          {s.collapseTitle(1)}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {s.collapseSingle(handle)}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {s.collapseSingleNote}
        </p>
      </div>
    </section>
  )
}

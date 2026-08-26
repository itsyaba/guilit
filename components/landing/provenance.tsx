import { Band, Eyebrow, Shell } from "@/components/kit"
import { TierTag } from "@/components/listing/tier-tag"
import { strings, type Lang } from "@/lib/i18n"
import type { ListingTier } from "@/lib/types"

/**
 * Where the data comes from, answered plainly.
 *
 * People wonder whether this is legal, whether we are reselling somebody else's
 * listings, and what happens to their post if they did not ask to be here. Those
 * are fair questions and the answer is short, so it is stated in prose rather
 * than dressed up as three feature cards.
 *
 * The tier copy is deliberately unflattering to ourselves: "Indexed" describes a
 * scraped post with an unverified seller, and presenting that as a trust badge
 * would be the exact fraud the tier system exists to prevent.
 */
export function Provenance({ lang }: { lang: Lang }) {
  const s = strings(lang)

  const tiers: { tier: ListingTier; title: string; body: string }[] = [
    {
      tier: "indexed",
      title: s.tierIndexedTitle,
      body: s.tierIndexedBody,
    },
    { tier: "claimed", title: s.tierClaimedTitle, body: s.tierClaimedBody },
    { tier: "native", title: s.tierNativeTitle, body: s.tierNativeBody },
  ]

  const stages = [
    { title: s.pipelineListen, body: s.pipelineListenBody },
    { title: s.pipelineStore, body: s.pipelineStoreBody },
    { title: s.pipelineExtract, body: s.pipelineExtractBody },
    { title: s.pipelineDedup, body: s.pipelineDedupBody },
    { title: s.pipelinePublish, body: s.pipelinePublishBody },
  ]

  return (
    <Band labelledBy="provenance-heading">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
        <div className="min-w-0">
          <Eyebrow>{s.eyebrowSource}</Eyebrow>

          <h2
            id="provenance-heading"
            className="type-section type-display mt-5 max-w-[18ch] font-semibold text-foreground"
          >
            {s.provenanceTitle}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
            {s.provenanceBody1}
          </p>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
            {s.provenanceBody2}
          </p>
        </div>

        {/* The three states a listing can be in, as rows in one enclosure --
            they are one scale, not three features. */}
        <div className="min-w-0">
          <h3 className="type-ledger type-mixed text-muted-foreground">
            {s.tiersTitle}
          </h3>

          <Shell className="mt-4" coreClassName="overflow-hidden">
            <dl>
              {tiers.map((entry) => (
                <div
                  key={entry.tier}
                  className="grid gap-2 border-b border-hairline px-5 py-5 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-6 sm:px-6"
                >
                  <dt className="pt-0.5">
                    <TierTag tier={entry.tier} />
                  </dt>
                  <dd className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {entry.title}
                    </p>
                    <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      {entry.body}
                    </p>
                  </dd>
                </div>
              ))}
            </dl>
          </Shell>
        </div>
      </div>

      {/*
       * The pipeline, five numbered tiles. The stage names are the actual module
       * names in ingest/, so a reader who opens the repository finds what this
       * promised.
       */}
      <div className="mt-14 lg:mt-20">
        <h3 className="type-ledger type-mixed text-muted-foreground">
          {s.pipelineTitle}
        </h3>

        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stages.map((stage, index) => (
            <li
              key={stage.title}
              className="rounded-panel bg-card p-5 shadow-hairline ring-1 ring-hairline transition-shadow duration-500 ease-fluid hover:shadow-ambient"
            >
              <span
                aria-hidden="true"
                className="type-ledger flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground"
              >
                {index + 1}
              </span>
              <h4 className="mt-4 text-sm font-semibold text-foreground">
                {stage.title}
              </h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {stage.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Band>
  )
}

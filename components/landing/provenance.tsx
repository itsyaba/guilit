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
    <section
      aria-labelledby="provenance-heading"
      className="border-b border-border"
    >
      <div className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-20">
          <div className="min-w-0">
            <h2
              id="provenance-heading"
              className="type-display max-w-[20ch] text-2xl font-semibold text-foreground sm:text-3xl"
            >
              {s.provenanceTitle}
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              {s.provenanceBody1}
            </p>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
              {s.provenanceBody2}
            </p>
          </div>

          <div className="min-w-0">
            <h3 className="type-ledger text-muted-foreground">
              {s.tiersTitle}
            </h3>
            <dl className="mt-4 divide-y divide-border border-t border-border">
              {tiers.map((entry) => (
                <div
                  key={entry.tier}
                  className="grid gap-2 py-5 sm:grid-cols-[8.5rem_1fr] sm:gap-6"
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
          </div>
        </div>

        {/*
         * The pipeline, compressed to one strip. The stage names are the actual
         * module names in ingest/, so a reader who opens the repository finds
         * what this promised.
         */}
        <div className="mt-14 border-t border-border pt-8">
          <h3 className="type-ledger text-muted-foreground">
            {s.pipelineTitle}
          </h3>
          <ol className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            {stages.map((stage) => (
              <li
                key={stage.title}
                className="border-t-2 border-foreground/15 pt-3"
              >
                <h4 className="text-sm font-semibold text-foreground">
                  {stage.title}
                </h4>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {stage.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

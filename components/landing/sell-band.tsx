import { Band, CtaLink, Eyebrow, Shell } from "@/components/kit"
import { conditionLabel } from "@/lib/format"
import { strings, type Lang } from "@/lib/i18n"
import type { ListingCondition } from "@/lib/types"

/**
 * The seller half of the brief, and the last thing on the page.
 *
 * Condition is the field second-hand buyers filter on hardest and the field
 * informal channel posts almost never carry, so the three states we track are
 * named here rather than described. They are the same three the post flow and
 * the browse filters use.
 *
 * Tinted rather than inverted: the page keeps one theme from top to bottom, and
 * a dark band dropped in here would read as a different website.
 */
const CONDITIONS: ListingCondition[] = ["brand_new", "lightly_used", "fair"]

export function SellBand({ lang }: { lang: Lang }) {
  const s = strings(lang)

  return (
    <Band labelledBy="sell-heading" className="pt-4 pb-16 sm:pt-6 lg:pb-28">
      <Shell
        tone="accent"
        coreClassName="relative isolate overflow-hidden px-5 py-14 text-center sm:px-10 lg:py-20"
      >
        <div
          aria-hidden="true"
          className="bg-wash pointer-events-none absolute inset-0 -z-10"
        />

        <Eyebrow>{s.eyebrowSell}</Eyebrow>

        <h2
          id="sell-heading"
          className="type-section type-display mx-auto mt-5 max-w-[20ch] font-semibold text-balance text-foreground"
        >
          {s.sellTitle}
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[1.0625rem]">
          {s.sellLede}
        </p>

        {/* Condition is the field second-hand buyers filter on hardest and the
            field informal channel posts almost never carry, so the three states
            we track are named rather than described. */}
        <ul className="mx-auto mt-8 flex flex-wrap justify-center gap-2">
          {CONDITIONS.map((condition) => (
            <li
              key={condition}
              className="rounded-full bg-card px-3.5 py-2 text-sm text-foreground shadow-hairline ring-1 ring-hairline"
            >
              {conditionLabel(condition, lang)}
            </li>
          ))}
        </ul>

        <div className="mt-9 flex justify-center">
          <CtaLink href="/post">{s.sellAction}</CtaLink>
        </div>

        <p className="mt-5 text-sm text-muted-foreground">{s.sellNote}</p>
      </Shell>
    </Band>
  )
}

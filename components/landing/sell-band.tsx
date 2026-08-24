import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
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
    <section
      aria-labelledby="sell-heading"
      className="bg-muted/40"
    >
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 lg:py-20">
        <h2
          id="sell-heading"
          className="type-display mx-auto max-w-[20ch] text-2xl font-semibold text-balance text-foreground sm:text-3xl"
        >
          {s.sellTitle}
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          {s.sellLede}
        </p>

        {/* Condition is the field second-hand buyers filter on hardest and the
            field informal channel posts almost never carry, so the three states
            we track are named rather than described. */}
        <ul className="mx-auto mt-8 flex flex-wrap justify-center gap-2">
          {CONDITIONS.map((condition) => (
            <li
              key={condition}
              className="rounded-4xl border border-border bg-card px-3.5 py-2 text-sm text-foreground"
            >
              {conditionLabel(condition, lang)}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          {/* A styled link, not a Button. base-ui's Button is a client
              component, and pulling it in to render an anchor shipped the
              library to a page whose only real buttons live inside two islands
              that already have their own. */}
          <Link href="/post" className={buttonVariants({ size: "lg" })}>
            {s.sellAction}
          </Link>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{s.sellNote}</p>
      </div>
    </section>
  )
}
